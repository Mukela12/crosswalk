package dev.crosswalk.audit;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import dev.crosswalk.security.CwUser;

@Service
public class AuditService {

    public record AuditView(long id, String actor, String action, String control, String detail, Instant at) {
        static AuditView of(AuditEvent e) {
            return new AuditView(e.getId(), e.getActorName(), e.getAction(), e.getControlCode(), e.getDetail(),
                    e.getAt());
        }
    }

    private final AuditEvents events;

    AuditService(AuditEvents events) {
        this.events = events;
    }

    /** Joins the caller's transaction, so the audit row commits or rolls back with the change. */
    @Transactional
    public void record(CwUser actor, String action, String controlCode, String detail) {
        events.save(new AuditEvent(actor.tenantId(), actor.id(), actor.displayName(), action, controlCode, detail,
                Instant.now()));
    }

    @Transactional(readOnly = true)
    public List<AuditView> recent(int limit) {
        return events.findByOrderByAtDescIdDesc(Limit.of(Math.clamp(limit, 1, 500))).stream().map(AuditView::of).toList();
    }
}
