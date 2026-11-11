package dev.crosswalk.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Origin lockdown. The Cloudflare Worker adds X-Edge-Auth to every request it forwards.
 * When EDGE_SECRET is set, API calls that skip the edge (straight to the Railway URL)
 * are refused, so the WAF, rate limits and headers at the edge can't be bypassed.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class EdgeGuard extends OncePerRequestFilter {

    public static final String HEADER = "X-Edge-Auth";
    public static final String CLIENT_IP_HEADER = "X-Client-IP";

    private final byte[] secret;

    public EdgeGuard(@Value("${crosswalk.edge-secret:}") String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    public boolean enabled() {
        return secret.length > 0;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !enabled() || !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String presented = request.getHeader(HEADER);
        byte[] given = presented == null ? new byte[0] : presented.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(secret, given)) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"Requests must come through the edge\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    /** The client IP. Trusts the Worker's header only when the edge secret was verified. */
    public String clientIp(HttpServletRequest request) {
        if (enabled()) {
            String forwarded = request.getHeader(CLIENT_IP_HEADER);
            if (forwarded != null && !forwarded.isBlank()) {
                return forwarded.trim();
            }
        }
        return request.getRemoteAddr();
    }
}
