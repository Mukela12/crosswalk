package dev.crosswalk.security;

import java.util.Locale;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class CwUserDetailsService implements UserDetailsService {

    private final JdbcClient jdbc;

    public CwUserDetailsService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public CwUser loadUserByUsername(String email) {
        String normalized = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        return jdbc.sql("select * from auth_lookup(?)")
                .param(normalized)
                .query((rs, n) -> new CwUser(
                        rs.getObject("id", UUID.class),
                        rs.getObject("tenant_id", UUID.class),
                        rs.getString("tenant_name"),
                        rs.getString("industry"),
                        rs.getString("email"),
                        rs.getString("display_name"),
                        CwUser.Role.valueOf(rs.getString("role")),
                        rs.getString("password_hash")))
                .optional()
                .orElseThrow(() -> new UsernameNotFoundException("No such user"));
    }
}
