package dev.crosswalk.compliance;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read model for frameworks, controls and readiness.
 *
 * None of these queries mention tenant_id. Evidence, scope and users are filtered by
 * row-level security using the tenant set at the start of the transaction.
 */
@Service
public class ComplianceService {

    public enum Status { MET, EXPIRING, STALE, MISSING }

    public record Ref(String framework, String ref, String title) {}

    public record ControlRow(int id, String code, String domain, String title, String description, Status status,
                             int evidenceCount, LocalDate expiresOn, List<Ref> refs) {}

    public record FrameworkReadiness(String code, String name, String version, int covered, int total) {}

    public record Overview(List<FrameworkReadiness> frameworks, Map<Status, Integer> controls) {}

    /** Evidence is valid until expires_on. Expiring = the best valid item lapses within 30 days. */
    private static final String CONTROL_STATUS = """
            with ev as (
                select control_id,
                       count(*) as total,
                       count(*) filter (where expires_on >= current_date) as valid,
                       max(expires_on) filter (where expires_on >= current_date) as best_expiry,
                       max(expires_on) as last_expiry
                from evidence
                group by control_id
            ),
            cs as (
                select c.id, c.code, c.domain, c.title, c.description,
                       coalesce(ev.total, 0) as evidence_count,
                       case when ev.total is null then 'MISSING'
                            when ev.valid = 0 then 'STALE'
                            when ev.best_expiry < current_date + 30 then 'EXPIRING'
                            else 'MET' end as status,
                       coalesce(ev.best_expiry, ev.last_expiry) as expires_on
                from control c
                left join ev on ev.control_id = c.id
                where exists (
                    select 1
                    from control_requirement cr
                    join requirement r on r.id = cr.requirement_id
                    join tenant_framework tf on tf.framework_id = r.framework_id
                    where cr.control_id = c.id)
            )
            """;

    private final JdbcClient jdbc;

    public ComplianceService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public Overview overview() {
        List<FrameworkReadiness> frameworks = jdbc.sql(CONTROL_STATUS + """
                select f.code, f.name, f.version,
                       count(distinct r.id) as total,
                       count(distinct r.id) filter (where cs.status in ('MET', 'EXPIRING')) as covered
                from tenant_framework tf
                join framework f on f.id = tf.framework_id
                join requirement r on r.framework_id = f.id
                join control_requirement cr on cr.requirement_id = r.id
                join cs on cs.id = cr.control_id
                group by f.id, f.code, f.name, f.version
                order by f.id
                """)
                .query((rs, n) -> new FrameworkReadiness(rs.getString("code"), rs.getString("name"),
                        rs.getString("version"), rs.getInt("covered"), rs.getInt("total")))
                .list();

        Map<Status, Integer> counts = new LinkedHashMap<>();
        for (Status s : Status.values()) {
            counts.put(s, 0);
        }
        jdbc.sql(CONTROL_STATUS + "select status, count(*) as n from cs group by status")
                .query((rs, n) -> Map.entry(Status.valueOf(rs.getString("status")), rs.getInt("n")))
                .list()
                .forEach(e -> counts.put(e.getKey(), e.getValue()));
        return new Overview(frameworks, counts);
    }

    /**
     * Controls in the tenant's scope. The search term is bound as a parameter and its LIKE
     * wildcards are escaped, so it is always matched as literal text.
     */
    @Transactional(readOnly = true)
    public List<ControlRow> controls(String query, String framework) {
        String q = query == null ? "" : query.strip();
        if (q.length() > 100) {
            q = q.substring(0, 100);
        }
        String pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        String fw = framework == null ? "" : framework.strip();

        List<ControlRow> rows = jdbc.sql(CONTROL_STATUS + """
                select * from cs
                where (:q = '' or cs.code ilike :pattern or cs.title ilike :pattern or cs.domain ilike :pattern
                       or exists (select 1 from control_requirement cr
                                  join requirement r on r.id = cr.requirement_id
                                  where cr.control_id = cs.id and r.ref ilike :pattern))
                  and (:fw = '' or exists (select 1 from control_requirement cr
                                  join requirement r on r.id = cr.requirement_id
                                  join framework f on f.id = r.framework_id
                                  where cr.control_id = cs.id and f.code = :fw))
                order by cs.id
                """)
                .param("q", q)
                .param("pattern", pattern)
                .param("fw", fw)
                .query((rs, n) -> new ControlRow(rs.getInt("id"), rs.getString("code"), rs.getString("domain"),
                        rs.getString("title"), rs.getString("description"), Status.valueOf(rs.getString("status")),
                        rs.getInt("evidence_count"), rs.getObject("expires_on", LocalDate.class), List.of()))
                .list();
        return withRefs(rows);
    }

    @Transactional(readOnly = true)
    public Optional<ControlRow> control(String code) {
        return jdbc.sql(CONTROL_STATUS + "select * from cs where cs.code = :code")
                .param("code", code)
                .query((rs, n) -> new ControlRow(rs.getInt("id"), rs.getString("code"), rs.getString("domain"),
                        rs.getString("title"), rs.getString("description"), Status.valueOf(rs.getString("status")),
                        rs.getInt("evidence_count"), rs.getObject("expires_on", LocalDate.class), List.of()))
                .optional()
                .map(row -> withRefs(List.of(row)).getFirst());
    }

    /** In-scope frameworks, for checking a requested report. */
    @Transactional(readOnly = true)
    public Optional<FrameworkReadiness> framework(String code) {
        return overview().frameworks().stream().filter(f -> f.code().equals(code)).findFirst();
    }

    private List<ControlRow> withRefs(List<ControlRow> rows) {
        if (rows.isEmpty()) {
            return rows;
        }
        Map<Integer, List<Ref>> refs = new LinkedHashMap<>();
        jdbc.sql("""
                select cr.control_id, f.code as framework, r.ref, r.title
                from control_requirement cr
                join requirement r on r.id = cr.requirement_id
                join framework f on f.id = r.framework_id
                join tenant_framework tf on tf.framework_id = f.id
                order by f.id, r.id
                """)
                .query((RowCallbackHandler) rs -> refs
                        .computeIfAbsent(rs.getInt("control_id"), k -> new ArrayList<>())
                        .add(new Ref(rs.getString("framework"), rs.getString("ref"), rs.getString("title"))));
        return rows.stream()
                .map(r -> new ControlRow(r.id(), r.code(), r.domain(), r.title(), r.description(), r.status(),
                        r.evidenceCount(), r.expiresOn(), refs.getOrDefault(r.id(), List.of())))
                .toList();
    }
}
