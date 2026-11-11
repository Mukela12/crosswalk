package dev.crosswalk.evidence;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "evidence")
public class Evidence {

    public enum Kind { FILE, LINK }

    @Id
    @GeneratedValue
    @UuidGenerator
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "control_id", nullable = false, updatable = false)
    private int controlId;

    @Column(nullable = false)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "text")
    private Kind kind;

    private String url;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "content_type")
    private String contentType;

    @Column(name = "size_bytes")
    private Integer sizeBytes;

    @Column(name = "collected_on", nullable = false)
    private LocalDate collectedOn;

    @Column(name = "expires_on", nullable = false)
    private LocalDate expiresOn;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Evidence() {}

    static Evidence link(UUID tenantId, int controlId, String title, String url, LocalDate collectedOn,
                         LocalDate expiresOn, UUID createdBy) {
        Evidence e = base(tenantId, controlId, title, collectedOn, expiresOn, createdBy);
        e.kind = Kind.LINK;
        e.url = url;
        return e;
    }

    static Evidence file(UUID tenantId, int controlId, String title, String fileName, String contentType, int size,
                         LocalDate collectedOn, LocalDate expiresOn, UUID createdBy) {
        Evidence e = base(tenantId, controlId, title, collectedOn, expiresOn, createdBy);
        e.kind = Kind.FILE;
        e.fileName = fileName;
        e.contentType = contentType;
        e.sizeBytes = size;
        return e;
    }

    private static Evidence base(UUID tenantId, int controlId, String title, LocalDate collectedOn,
                                 LocalDate expiresOn, UUID createdBy) {
        Evidence e = new Evidence();
        e.tenantId = tenantId;
        e.controlId = controlId;
        e.title = title;
        e.collectedOn = collectedOn;
        e.expiresOn = expiresOn;
        e.createdBy = createdBy;
        e.createdAt = Instant.now();
        return e;
    }

    public UUID getId() { return id; }
    public UUID getTenantId() { return tenantId; }
    public int getControlId() { return controlId; }
    public String getTitle() { return title; }
    public Kind getKind() { return kind; }
    public String getUrl() { return url; }
    public String getFileName() { return fileName; }
    public String getContentType() { return contentType; }
    public Integer getSizeBytes() { return sizeBytes; }
    public LocalDate getCollectedOn() { return collectedOn; }
    public LocalDate getExpiresOn() { return expiresOn; }
    public UUID getCreatedBy() { return createdBy; }
    public Instant getCreatedAt() { return createdAt; }
}
