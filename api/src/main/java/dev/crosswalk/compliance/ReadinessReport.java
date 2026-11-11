package dev.crosswalk.compliance;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import dev.crosswalk.audit.AuditService;
import dev.crosswalk.security.Tenancy;

/** Auditor-ready CSV: one row per requirement, with the controls and evidence behind it. */
@Component
public class ReadinessReport {

    record Line(String ref, String title, String controls, String status, String evidence, LocalDate expires) {}

    private final JdbcClient jdbc;
    private final AuditService audit;

    ReadinessReport(JdbcClient jdbc, AuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional
    public byte[] csv(ComplianceService.FrameworkReadiness framework) {
        List<Line> lines = jdbc.sql("""
                with ev as (
                    select control_id, title, expires_on from evidence
                ),
                per_req as (
                    select r.id, r.ref, r.title,
                           string_agg(distinct c.code, ' ' order by c.code) as controls,
                           bool_or(ev.expires_on >= current_date) as any_valid,
                           string_agg(distinct ev.title, '; ') filter (where ev.expires_on >= current_date) as evidence,
                           max(ev.expires_on) filter (where ev.expires_on >= current_date) as expires
                    from requirement r
                    join framework f on f.id = r.framework_id and f.code = :fw
                    join control_requirement cr on cr.requirement_id = r.id
                    join control c on c.id = cr.control_id
                    left join ev on ev.control_id = c.id
                    group by r.id, r.ref, r.title
                )
                select * from per_req order by id
                """)
                .param("fw", framework.code())
                .query((rs, n) -> new Line(rs.getString("ref"), rs.getString("title"), rs.getString("controls"),
                        Boolean.TRUE.equals(rs.getObject("any_valid", Boolean.class)) ? "Covered" : "Gap",
                        rs.getString("evidence"), rs.getObject("expires", LocalDate.class)))
                .list();

        StringBuilder out = new StringBuilder("﻿");
        row(out, "Requirement", "Title", "Controls", "Status", "Current evidence", "Evidence valid until");
        for (Line l : lines) {
            row(out, l.ref(), l.title(), l.controls(), l.status(), l.evidence(),
                    l.expires() == null ? "" : l.expires().toString());
        }
        audit.record(Tenancy.requireUser(), "REPORT_EXPORTED", null, framework.name());
        return out.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void row(StringBuilder out, String... cells) {
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) {
                out.append(',');
            }
            out.append(cell(cells[i]));
        }
        out.append("\r\n");
    }

    /**
     * Quotes every cell and defuses spreadsheet formulas. Evidence titles are user input, and a
     * title like =HYPERLINK(...) would otherwise run when an auditor opens the file in Excel.
     */
    static String cell(String value) {
        String v = value == null ? "" : value;
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        return "\"" + v.replace("\"", "\"\"") + "\"";
    }
}
