package dev.crosswalk.audit;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

/** One row of the append-only audit trail. The database refuses updates and deletes. */
@Entity
@Immutable
@Table(name = "audit_event")
public class AuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "actor_id")
    private UUID actorId;

    @Column(name = "actor_name", nullable = false)
    private String actorName;

    @Column(nullable = false)
    private String action;

    @Column(name = "control_code")
    private String controlCode;

    private String detail;

    @Column(nullable = false)
    private Instant at;

    protected AuditEvent() {}

    public AuditEvent(UUID tenantId, UUID actorId, String actorName, String action, String controlCode,
                      String detail, Instant at) {
        this.tenantId = tenantId;
        this.actorId = actorId;
        this.actorName = actorName;
        this.action = action;
        this.controlCode = controlCode;
        this.detail = detail;
        this.at = at;
    }

    public Long getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public String getActorName() { return actorName; }
    public String getAction() { return action; }
    public String getControlCode() { return controlCode; }
    public String getDetail() { return detail; }
    public Instant getAt() { return at; }
}
