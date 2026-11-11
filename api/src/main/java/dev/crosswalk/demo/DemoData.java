package dev.crosswalk.demo;

import java.sql.Driver;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SimpleDriverDataSource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import dev.crosswalk.live.LiveEvent;
import dev.crosswalk.live.LiveHub;

/**
 * Demo accounts and evidence. Runs as the schema owner on its own connection, outside the
 * application's tenant-scoped pool, because it writes for every tenant and truncates the
 * audit trail on reset (the app role can do neither).
 */
@Component
public class DemoData implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoData.class);

    public static final UUID LEDGERLY = UUID.fromString("6f1c2a3e-8d4b-4c1a-9e2f-1a2b3c4d5e01");
    public static final UUID KESTREL = UUID.fromString("6f1c2a3e-8d4b-4c1a-9e2f-1a2b3c4d5e02");
    public static final UUID NADIA = UUID.fromString("a7d0c6b1-5e2f-4a3b-8c9d-0e1f2a3b4c01");
    public static final UUID TOMAS = UUID.fromString("a7d0c6b1-5e2f-4a3b-8c9d-0e1f2a3b4c02");
    public static final UUID IMANI = UUID.fromString("a7d0c6b1-5e2f-4a3b-8c9d-0e1f2a3b4c03");

    record Account(UUID id, UUID tenant, String email, String name, String role) {}

    record Company(UUID id, String name, String industry, List<String> frameworks, String pattern, UUID lead,
                   String leadName) {}

    static final List<Account> ACCOUNTS = List.of(
            new Account(NADIA, LEDGERLY, "nadia@ledgerly.example", "Nadia Brooks", "LEAD"),
            new Account(TOMAS, LEDGERLY, "tomas@halvorsen-audit.example", "Tomas Lindqvist", "AUDITOR"),
            new Account(IMANI, KESTREL, "imani@kestrelhealth.example", "Imani Mwale", "LEAD"));

    // One letter per control, in control order: M met, E expiring, S stale, X missing.
    static final List<Company> COMPANIES = List.of(
            new Company(LEDGERLY, "Ledgerly", "Payments", List.of("SOC2", "ISO27001", "PCIDSS"),
                    "MMEMMSMXMMEMMXMMMSMEMMXE", NADIA, "Nadia Brooks"),
            new Company(KESTREL, "Kestrel Health", "Telehealth", List.of("SOC2", "HIPAA"),
                    "MXMSMMEXMSXMMXEMSXMMXSEM", IMANI, "Imani Mwale"));

    private final JdbcClient owner;
    private final TransactionTemplate tx;
    private final PasswordEncoder encoder;
    private final LiveHub hub;
    private final boolean enabled;
    private final String demoPassword;

    DemoData(@Value("${spring.flyway.url}") String url, @Value("${spring.flyway.user}") String user,
             @Value("${spring.flyway.password:}") String password, @Value("${crosswalk.demo.enabled}") boolean enabled,
             @Value("${crosswalk.demo.password}") String demoPassword, PasswordEncoder encoder, LiveHub hub)
            throws Exception {
        var ds = new SimpleDriverDataSource((Driver) Class.forName("org.postgresql.Driver")
                .getDeclaredConstructor().newInstance(), url, user, password);
        this.owner = JdbcClient.create(ds);
        this.tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        this.encoder = encoder;
        this.hub = hub;
        this.enabled = enabled;
        this.demoPassword = demoPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) {
            return;
        }
        seedAccounts();
        reset();
    }

    @Scheduled(cron = "${crosswalk.demo.reset-cron}")
    void scheduledReset() {
        if (enabled) {
            reset();
            hub.publish(new LiveEvent(null, "reset", null, null));
        }
    }

    void seedAccounts() {
        tx.executeWithoutResult(status -> {
            for (Company c : COMPANIES) {
                owner.sql("""
                        insert into tenant (id, name, industry) values (?, ?, ?)
                        on conflict (id) do update set name = excluded.name, industry = excluded.industry
                        """).params(c.id(), c.name(), c.industry()).update();
                owner.sql("delete from tenant_framework where tenant_id = ?").param(c.id()).update();
                for (String fw : c.frameworks()) {
                    owner.sql("insert into tenant_framework select ?, id from framework where code = ?")
                            .params(c.id(), fw).update();
                }
            }
            for (Account a : ACCOUNTS) {
                owner.sql("""
                        insert into app_user (id, tenant_id, email, password_hash, display_name, role)
                        values (?, ?, ?, ?, ?, ?)
                        on conflict (id) do update set email = excluded.email, password_hash = excluded.password_hash,
                            display_name = excluded.display_name, role = excluded.role
                        """).params(a.id(), a.tenant(), a.email(), encoder.encode(demoPassword), a.name(), a.role())
                        .update();
            }
        });
    }

    /** Wipes evidence and the audit trail, then lays down the starting state relative to today. */
    public void reset() {
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        tx.executeWithoutResult(status -> {
            owner.sql("truncate audit_event, evidence_file, evidence").update();
            for (Company c : COMPANIES) {
                seedCompany(c, today);
            }
        });
        log.info("Demo data reset for {} companies", COMPANIES.size());
    }

    private record Seeded(Instant at, String control, String title) {}

    private void seedCompany(Company company, LocalDate today) {
        record ControlInfo(int id, String code, String title, List<String> samples) {}
        List<ControlInfo> controls = owner.sql("""
                select c.id, c.code, c.title,
                       array(select s.title from control_sample_evidence s where s.control_id = c.id order by s.ord) as samples
                from control c order by c.id
                """)
                .query((rs, n) -> new ControlInfo(rs.getInt("id"), rs.getString("code"), rs.getString("title"),
                        List.of((String[]) rs.getArray("samples").getArray())))
                .list();

        List<Seeded> history = new ArrayList<>();
        for (int i = 0; i < controls.size(); i++) {
            ControlInfo control = controls.get(i);
            char state = company.pattern().charAt(i % company.pattern().length());
            if (state == 'X') {
                continue;
            }
            int items = state == 'M' && control.samples().size() > 1 && i % 3 == 0 ? 2 : 1;
            for (int k = 0; k < items; k++) {
                String title = control.samples().get(k % control.samples().size());
                LocalDate expires = switch (state) {
                    case 'E' -> today.plusDays(6 + (i * 7 % 20));
                    case 'S' -> today.minusDays(4 + (i * 11 % 50));
                    default -> today.plusDays(95 + (i * 37 % 240) + k * 30);
                };
                LocalDate collected = expires.minusDays(365);
                if (collected.isAfter(today)) {
                    collected = today.minusDays(3 + i);
                }
                Instant addedAt = collected.atTime(9 + (i % 8), (i * 13 + k * 7) % 60).toInstant(ZoneOffset.UTC);
                insertEvidence(company, control.id(), control.code(), control.title(), title, collected, expires,
                        addedAt);
                history.add(new Seeded(addedAt, control.code(), title));
            }
        }

        history.sort(Comparator.comparing(Seeded::at));
        for (Seeded s : history) {
            owner.sql("""
                    insert into audit_event (tenant_id, actor_id, actor_name, action, control_code, detail, at)
                    values (?, ?, ?, 'EVIDENCE_ADDED', ?, ?, ?)
                    """).params(company.id(), company.lead(), company.leadName(), s.control(), s.title(),
                    java.sql.Timestamp.from(s.at())).update();
        }
        if (company.id().equals(LEDGERLY)) {
            owner.sql("""
                    insert into audit_event (tenant_id, actor_id, actor_name, action, detail, at)
                    values (?, ?, 'Tomas Lindqvist', 'REPORT_EXPORTED', 'PCI DSS', ?)
                    """).params(LEDGERLY, TOMAS, java.sql.Timestamp.from(
                    today.minusDays(2).atTime(14, 20).toInstant(ZoneOffset.UTC))).update();
        }
    }

    private void insertEvidence(Company company, int controlId, String controlCode, String controlTitle,
                                String title, LocalDate collected, LocalDate expires, Instant addedAt) {
        UUID id = UUID.randomUUID();
        String fileName = title.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "")
                + ".pdf";
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);
        byte[] pdf = PdfStub.page(title, List.of(
                company.name() + ", " + company.industry(),
                "Control " + controlCode + ": " + controlTitle,
                "Collected " + collected.format(fmt) + " by " + company.leadName(),
                "Valid until " + expires.format(fmt),
                "",
                "Sample evidence generated for the Crosswalk demo."));
        owner.sql("""
                insert into evidence (id, tenant_id, control_id, title, kind, file_name, content_type, size_bytes,
                                      collected_on, expires_on, created_by, created_at)
                values (?, ?, ?, ?, 'FILE', ?, 'application/pdf', ?, ?, ?, ?, ?)
                """).params(id, company.id(), controlId, title, fileName, pdf.length, collected, expires,
                company.lead(), java.sql.Timestamp.from(addedAt)).update();
        owner.sql("insert into evidence_file (evidence_id, tenant_id, bytes) values (?, ?, ?)")
                .params(id, company.id(), pdf).update();
    }
}
