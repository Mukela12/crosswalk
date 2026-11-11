package dev.crosswalk.attacks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;

import javax.sql.DataSource;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Talks to Postgres as crosswalk_app, the role the API uses, with no Java in between.
 * If a future code change forgets a check, these guardrails still hold.
 */
@DisplayName("A01 + A08:2025 Database guardrails (row-level security, append-only audit)")
class DatabaseGuardrailsTest extends AttackTest {

    @Autowired
    DataSource appRole;

    @Test
    @DisplayName("With no tenant set, the app role sees zero rows (fails closed)")
    void noTenantSeesNothing() throws Exception {
        try (Connection c = appRole.getConnection()) {
            assertThat(count(c, "select count(*) from evidence")).isZero();
            assertThat(count(c, "select count(*) from audit_event")).isZero();
            assertThat(count(c, "select count(*) from app_user")).isZero();
        }
    }

    @Test
    @DisplayName("Scoped to Kestrel, Ledgerly's rows don't exist even with an explicit where clause")
    void tenantScopeHidesOthers() throws Exception {
        try (Connection c = appRole.getConnection()) {
            c.setAutoCommit(false);
            setTenant(c, KESTREL);
            assertThat(count(c, "select count(*) from evidence where tenant_id = '" + LEDGERLY + "'")).isZero();
            assertThat(count(c, "select count(*) from evidence_file where tenant_id = '" + LEDGERLY + "'")).isZero();
            assertThat(count(c, "select count(*) from evidence")).isPositive();
            c.rollback();
        }
    }

    @Test
    @DisplayName("Scoped to Kestrel, inserting a row for Ledgerly is refused by the policy")
    void cannotWriteIntoAnotherTenant() throws Exception {
        try (Connection c = appRole.getConnection()) {
            c.setAutoCommit(false);
            setTenant(c, KESTREL);
            assertThatThrownBy(() -> exec(c, """
                    insert into audit_event (tenant_id, actor_name, action) values ('%s', 'x', 'FORGED')
                    """.formatted(LEDGERLY)))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("row-level security");
            c.rollback();
        }
    }

    @Test
    @DisplayName("The app role can't read password hashes")
    void noPasswordHashes() throws Exception {
        try (Connection c = appRole.getConnection()) {
            c.setAutoCommit(false);
            setTenant(c, LEDGERLY);
            assertThatThrownBy(() -> count(c, "select count(password_hash) from app_user"))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("permission denied");
            c.rollback();
        }
    }

    @Test
    @DisplayName("Audit rows can't be edited or deleted by the app role")
    void auditIsAppendOnly() throws Exception {
        try (Connection c = appRole.getConnection()) {
            c.setAutoCommit(false);
            setTenant(c, LEDGERLY);
            assertThatThrownBy(() -> exec(c, "update audit_event set actor_name = 'someone else'"))
                    .hasMessageContaining("permission denied");
            c.rollback();
            setTenant(c, LEDGERLY);
            assertThatThrownBy(() -> exec(c, "delete from audit_event"))
                    .hasMessageContaining("permission denied");
            c.rollback();
        }
    }

    @Test
    @DisplayName("Audit rows can't be edited even by the schema owner")
    void auditIsAppendOnlyForOwner() {
        assertThatThrownBy(() -> demoOwnerJdbc().sql("update audit_event set detail = 'rewritten'").update())
                .hasMessageContaining("append-only");
    }

    @Test
    @DisplayName("The app role can't switch off row-level security or take ownership")
    void cannotDisableRls() throws Exception {
        try (Connection c = appRole.getConnection()) {
            assertThatThrownBy(() -> exec(c, "alter table evidence disable row level security"))
                    .hasMessageContaining("must be owner");
            assertThatThrownBy(() -> exec(c, "set role postgres"))
                    .isInstanceOf(SQLException.class);
        }
    }

    private static void setTenant(Connection c, UUID tenant) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("select set_config('app.tenant_id', ?, true)")) {
            ps.setString(1, tenant.toString());
            ps.execute();
        }
    }

    private static long count(Connection c, String sql) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            rs.next();
            return rs.getLong(1);
        }
    }

    private static void exec(Connection c, String sql) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            ps.execute();
        }
    }
}
