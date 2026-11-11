package dev.crosswalk.security;

import java.util.Optional;
import java.util.UUID;

import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** Reads the current user and tenant from the security context. Never from request input. */
public final class Tenancy {

    private Tenancy() {}

    public static Optional<CwUser> currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof CwUser user) {
            return Optional.of(user);
        }
        return Optional.empty();
    }

    public static CwUser requireUser() {
        return currentUser().orElseThrow(() -> new AuthenticationCredentialsNotFoundException("Not signed in"));
    }

    public static UUID tenantIdOrNull() {
        return currentUser().map(CwUser::tenantId).orElse(null);
    }
}
