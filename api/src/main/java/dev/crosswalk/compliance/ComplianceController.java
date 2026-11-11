package dev.crosswalk.compliance;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import dev.crosswalk.evidence.Evidence;
import dev.crosswalk.evidence.EvidenceService;
import dev.crosswalk.security.CwUser;
import dev.crosswalk.security.Tenancy;
import dev.crosswalk.web.ApiException;

@RestController
public class ComplianceController {

    public record EvidenceView(UUID id, String title, String kind, String url, String fileName, Integer sizeBytes,
                               LocalDate collectedOn, LocalDate expiresOn) {
        static EvidenceView of(Evidence e) {
            return new EvidenceView(e.getId(), e.getTitle(), e.getKind().name(), e.getUrl(), e.getFileName(),
                    e.getSizeBytes(), e.getCollectedOn(), e.getExpiresOn());
        }
    }

    public record ControlDetail(ComplianceService.ControlRow control, List<EvidenceView> evidence, boolean canEdit) {}

    private final ComplianceService compliance;
    private final EvidenceService evidence;
    private final ReadinessReport report;

    ComplianceController(ComplianceService compliance, EvidenceService evidence, ReadinessReport report) {
        this.compliance = compliance;
        this.evidence = evidence;
        this.report = report;
    }

    @GetMapping("/api/overview")
    ComplianceService.Overview overview() {
        return compliance.overview();
    }

    @GetMapping("/api/controls")
    List<ComplianceService.ControlRow> controls(@RequestParam(required = false) String q,
                                                @RequestParam(required = false) String framework) {
        return compliance.controls(q, framework);
    }

    @GetMapping("/api/controls/{code}")
    ControlDetail control(@PathVariable String code) {
        var control = compliance.control(code).orElseThrow(() -> ApiException.notFound("Control not found"));
        var items = evidence.forControl(control.id()).stream().map(EvidenceView::of).toList();
        return new ControlDetail(control, items, Tenancy.requireUser().role() == CwUser.Role.LEAD);
    }

    /**
     * Multipart form. Only these named fields bind: a tenantId, createdBy or role field
     * in the request is ignored, because none exists on this method.
     */
    @PostMapping(path = "/api/controls/{code}/evidence", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('LEAD')")
    ResponseEntity<EvidenceView> addEvidence(@PathVariable String code,
                                             @RequestParam String title,
                                             @RequestParam LocalDate collectedOn,
                                             @RequestParam LocalDate expiresOn,
                                             @RequestParam(required = false) String url,
                                             @RequestParam(required = false) MultipartFile file) throws java.io.IOException {
        byte[] bytes = file == null || file.isEmpty() ? null : file.getBytes();
        String name = file == null ? null : file.getOriginalFilename();
        Evidence saved = evidence.add(code,
                new EvidenceService.NewEvidence(title, collectedOn, expiresOn, url, name, bytes));
        return ResponseEntity.status(HttpStatus.CREATED).body(EvidenceView.of(saved));
    }

    @DeleteMapping("/api/evidence/{id}")
    @PreAuthorize("hasRole('LEAD')")
    ResponseEntity<Void> removeEvidence(@PathVariable UUID id) {
        evidence.remove(id);
        return ResponseEntity.noContent().build();
    }

    /** Always a download, never rendered inline, and sandboxed if a browser tries anyway. */
    @GetMapping("/api/evidence/{id}/file")
    ResponseEntity<byte[]> download(@PathVariable UUID id) {
        var file = evidence.file(id).orElseThrow(() -> ApiException.notFound("File not found"));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(file.fileName()).build().toString())
                .header("Content-Security-Policy", "sandbox; default-src 'none'")
                .header("X-Content-Type-Options", "nosniff")
                .body(file.bytes());
    }

    @GetMapping("/api/reports/{framework}")
    ResponseEntity<byte[]> report(@PathVariable String framework) {
        var fw = compliance.framework(framework).orElseThrow(() -> ApiException.notFound("Framework not in scope"));
        byte[] csv = report.csv(fw);
        String fileName = Tenancy.requireUser().tenantName().toLowerCase().replaceAll("[^a-z0-9]+", "-")
                + "-" + fw.code().toLowerCase() + "-readiness-" + LocalDate.now() + ".csv";
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(fileName).build().toString())
                .body(csv);
    }
}
