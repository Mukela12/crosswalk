package dev.crosswalk.security;

import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import dev.crosswalk.audit.AuditService;

@RestController
@RequestMapping("/api")
public class SessionController {

    public record SignIn(@NotBlank @Email @Size(max = 200) String email,
                         @NotBlank @Size(max = 200) String password) {}

    public record SessionView(String name, String email, String role, String company, String industry) {
        static SessionView of(CwUser u) {
            return new SessionView(u.displayName(), u.email(), u.role().name(), u.tenantName(), u.industry());
        }
    }

    private final AuthenticationManager authenticationManager;
    private final SessionAuthenticationStrategy sessionStrategy;
    private final SecurityContextRepository contexts;
    private final LoginThrottle throttle;
    private final EdgeGuard edge;
    private final AuditService audit;
    private final SecurityContextHolderStrategy holder = SecurityContextHolder.getContextHolderStrategy();

    public SessionController(AuthenticationManager authenticationManager, SessionAuthenticationStrategy sessionStrategy,
                             SecurityContextRepository contexts, LoginThrottle throttle, EdgeGuard edge,
                             AuditService audit) {
        this.authenticationManager = authenticationManager;
        this.sessionStrategy = sessionStrategy;
        this.contexts = contexts;
        this.throttle = throttle;
        this.edge = edge;
        this.audit = audit;
    }

    /** Issues the CSRF cookie. Called once before sign-in. */
    @GetMapping("/csrf")
    public ResponseEntity<Void> csrf(CsrfToken token) {
        token.getToken();
        return ResponseEntity.noContent().build();
    }

    /** The signed-in user, or 204 when signed out (so a first visit doesn't log a 401). */
    @GetMapping("/session")
    public ResponseEntity<SessionView> current() {
        return Tenancy.currentUser()
                .map(user -> ResponseEntity.ok(SessionView.of(user)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/session")
    public ResponseEntity<?> signIn(@Valid @RequestBody SignIn body, HttpServletRequest request,
                                    HttpServletResponse response) {
        String ip = edge.clientIp(request);
        var blocked = throttle.blockedFor(ip, body.email());
        if (blocked.isPresent()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header(HttpHeaders.RETRY_AFTER, String.valueOf(Math.max(1, blocked.get().toSeconds())))
                    .body(Map.of("error", "Too many attempts. Try again in a few minutes."));
        }
        Authentication auth;
        try {
            auth = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(body.email(), body.password()));
        } catch (AuthenticationException e) {
            throttle.recordFailure(ip, body.email());
            // Same answer for an unknown email and a wrong password: no account enumeration.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Email or password is incorrect"));
        }
        throttle.recordSuccess(ip, body.email());
        sessionStrategy.onAuthentication(auth, request, response);
        SecurityContext context = holder.createEmptyContext();
        context.setAuthentication(auth);
        holder.setContext(context);
        contexts.saveContext(context, request, response);

        CwUser user = (CwUser) auth.getPrincipal();
        audit.record(user, "SIGNED_IN", null, null);
        return ResponseEntity.ok(SessionView.of(user));
    }
}
