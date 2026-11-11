package dev.crosswalk.evidence;

import java.net.URI;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.EntityManager;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.crosswalk.audit.AuditService;
import dev.crosswalk.compliance.ComplianceService;
import dev.crosswalk.live.LiveEvent;
import dev.crosswalk.security.CwUser;
import dev.crosswalk.security.Tenancy;
import dev.crosswalk.web.ApiException;

@Service
public class EvidenceService {

    public record NewEvidence(String title, LocalDate collectedOn, LocalDate expiresOn, String url, String fileName,
                              byte[] bytes) {}

    public record FileDownload(String fileName, String contentType, byte[] bytes) {}

    static final int MAX_BYTES = 2 * 1024 * 1024;

    private final EvidenceRepository evidence;
    private final ComplianceService compliance;
    private final AuditService audit;
    private final JdbcClient jdbc;
    private final EntityManager em;
    private final ApplicationEventPublisher events;

    EvidenceService(EvidenceRepository evidence, ComplianceService compliance, AuditService audit, JdbcClient jdbc,
                    EntityManager em, ApplicationEventPublisher events) {
        this.evidence = evidence;
        this.compliance = compliance;
        this.audit = audit;
        this.jdbc = jdbc;
        this.em = em;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<Evidence> forControl(int controlId) {
        return evidence.findByControlIdOrderByExpiresOnDesc(controlId);
    }

    /** Tenant and author come from the session. Nothing in the request can set them. */
    @Transactional
    public Evidence add(String controlCode, NewEvidence in) {
        CwUser user = Tenancy.requireUser();
        var control = compliance.control(controlCode).orElseThrow(() -> ApiException.notFound("Control not found"));
        validateDates(in.collectedOn(), in.expiresOn());
        String title = in.title() == null ? "" : in.title().strip();
        if (title.isEmpty() || title.length() > 120) {
            throw ApiException.badRequest("Title must be 1 to 120 characters");
        }
        boolean hasFile = in.bytes() != null && in.bytes().length > 0;
        boolean hasUrl = in.url() != null && !in.url().isBlank();
        if (hasFile == hasUrl) {
            throw ApiException.badRequest("Attach a file or a link, not both");
        }

        Evidence saved;
        if (hasUrl) {
            saved = Evidence.link(user.tenantId(), control.id(), title, safeUrl(in.url()), in.collectedOn(),
                    in.expiresOn(), user.id());
            em.persist(saved);
        } else {
            if (in.bytes().length > MAX_BYTES) {
                throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "Files can be up to 2 MB");
            }
            FileTypes.FileType type = FileTypes.detect(in.bytes(), in.fileName()).orElseThrow(() ->
                    new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                            "Upload a PDF, PNG, JPEG, CSV or TXT file"));
            saved = Evidence.file(user.tenantId(), control.id(), title, FileTypes.safeName(in.fileName(), type),
                    type.contentType(), in.bytes().length, in.collectedOn(), in.expiresOn(), user.id());
            em.persist(saved);
            em.flush();
            jdbc.sql("insert into evidence_file (evidence_id, tenant_id, bytes) values (?, ?, ?)")
                    .params(saved.getId(), user.tenantId(), in.bytes())
                    .update();
        }
        audit.record(user, "EVIDENCE_ADDED", control.code(), title);
        events.publishEvent(new LiveEvent(user.tenantId(), "evidence.added", control.code(), user.displayName()));
        return saved;
    }

    @Transactional
    public void remove(UUID id) {
        CwUser user = Tenancy.requireUser();
        // Another tenant's evidence is invisible here, so it is a 404 rather than a 403.
        Evidence e = evidence.findById(id).orElseThrow(() -> ApiException.notFound("Evidence not found"));
        String controlCode = codeOf(e.getControlId());
        evidence.delete(e);
        audit.record(user, "EVIDENCE_REMOVED", controlCode, e.getTitle());
        events.publishEvent(new LiveEvent(user.tenantId(), "evidence.removed", controlCode, user.displayName()));
    }

    @Transactional(readOnly = true)
    public Optional<FileDownload> file(UUID id) {
        return evidence.findById(id)
                .filter(e -> e.getKind() == Evidence.Kind.FILE)
                .flatMap(e -> jdbc.sql("select bytes from evidence_file where evidence_id = ?")
                        .param(id)
                        .query((rs, n) -> new FileDownload(e.getFileName(), e.getContentType(), rs.getBytes(1)))
                        .optional());
    }

    private String codeOf(int controlId) {
        return jdbc.sql("select code from control where id = ?").param(controlId).query(String.class).single();
    }

    private static void validateDates(LocalDate collected, LocalDate expires) {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        if (collected == null || expires == null) {
            throw ApiException.badRequest("Collected and expiry dates are required");
        }
        if (collected.isAfter(today)) {
            throw ApiException.badRequest("Collected date can't be in the future");
        }
        if (!expires.isAfter(collected)) {
            throw ApiException.badRequest("Expiry must be after the collected date");
        }
        if (expires.isAfter(today.plusYears(3))) {
            throw ApiException.badRequest("Expiry can be at most 3 years out");
        }
    }

    /** https only, with a host. Blocks javascript:, data: and other schemes that execute in the browser. */
    private static String safeUrl(String raw) {
        String url = raw.strip();
        if (url.length() > 500) {
            throw ApiException.badRequest("Links can be up to 500 characters");
        }
        try {
            URI uri = new URI(url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
                throw ApiException.badRequest("Links must start with https://");
            }
            return uri.toString();
        } catch (java.net.URISyntaxException e) {
            throw ApiException.badRequest("That link isn't a valid URL");
        }
    }
}
