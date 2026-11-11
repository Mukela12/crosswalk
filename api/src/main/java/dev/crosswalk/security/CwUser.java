package dev.crosswalk.security;

import java.io.Serial;
import java.io.Serializable;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/** The signed-in user. Stored in the HTTP session, so it carries no password after sign-in. */
public final class CwUser implements UserDetails, CredentialsContainer, Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    public enum Role { LEAD, AUDITOR }

    private final UUID id;
    private final UUID tenantId;
    private final String tenantName;
    private final String industry;
    private final String email;
    private final String displayName;
    private final Role role;
    private String passwordHash;

    public CwUser(UUID id, UUID tenantId, String tenantName, String industry, String email,
                  String displayName, Role role, String passwordHash) {
        this.id = id;
        this.tenantId = tenantId;
        this.tenantName = tenantName;
        this.industry = industry;
        this.email = email;
        this.displayName = displayName;
        this.role = role;
        this.passwordHash = passwordHash;
    }

    public UUID id() { return id; }
    public UUID tenantId() { return tenantId; }
    public String tenantName() { return tenantName; }
    public String industry() { return industry; }
    public String email() { return email; }
    public String displayName() { return displayName; }
    public Role role() { return role; }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getPassword() { return passwordHash; }

    @Override
    public String getUsername() { return email; }

    @Override
    public void eraseCredentials() { passwordHash = null; }
}
