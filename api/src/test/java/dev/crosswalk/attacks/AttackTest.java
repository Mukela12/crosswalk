package dev.crosswalk.attacks;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import dev.crosswalk.demo.DemoData;

/**
 * Base for the attack suite. Each test plays an attacker against the real API and a real
 * Postgres with row-level security on, and expects a refusal, not just a working happy path.
 * Demo data is reset before every test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
abstract class AttackTest {

    static final String PASSWORD = "crosswalk-demo";
    static final String NADIA = "nadia@ledgerly.example";          // Ledgerly, compliance lead
    static final String TOMAS = "tomas@halvorsen-audit.example";   // Ledgerly, auditor (read-only)
    static final String IMANI = "imani@kestrelhealth.example";     // Kestrel Health, compliance lead

    @Autowired
    MockMvc mvc;

    @Autowired
    DemoData demo;

    @Autowired
    JdbcClient jdbc;

    @BeforeEach
    void resetDemoData() {
        demo.reset();
    }

    MockHttpSession signIn(String email) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/session").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getRequest().getSession(false);
    }

    MockMultipartHttpServletRequestBuilder upload(String control, MockMultipartFile file, MockHttpSession session) {
        return upload(control, file, session, "Uploaded evidence", LocalDate.now().minusDays(1),
                LocalDate.now().plusDays(200));
    }

    MockMultipartHttpServletRequestBuilder upload(String control, MockMultipartFile file, MockHttpSession session,
                                                  String title, LocalDate collectedOn, LocalDate expiresOn) {
        MockMultipartHttpServletRequestBuilder req = multipart("/api/controls/" + control + "/evidence");
        if (file != null) {
            req.file(file);
        }
        req.param("title", title)
                .param("collectedOn", collectedOn.toString())
                .param("expiresOn", expiresOn.toString())
                .session(session);
        req.with(csrf());
        return req;
    }

    static MockMultipartFile pdf(String name) {
        return new MockMultipartFile("file", name, "application/pdf", "%PDF-1.4\n%test\n".getBytes());
    }

    /** Evidence ids read as the schema owner, bypassing RLS, so tests can aim at another tenant's rows. */
    UUID anyEvidenceOf(UUID tenant) {
        return demoOwnerJdbc().sql("select id from evidence where tenant_id = ? and kind = 'FILE' limit 1")
                .param(tenant).query(UUID.class).single();
    }

    int evidenceCount(UUID tenant) {
        return demoOwnerJdbc().sql("select count(*) from evidence where tenant_id = ?")
                .param(tenant).query(Integer.class).single();
    }

    @Autowired
    org.springframework.core.env.Environment env;

    JdbcClient demoOwnerJdbc() {
        var ds = new org.springframework.jdbc.datasource.DriverManagerDataSource(
                env.getProperty("spring.flyway.url"), env.getProperty("spring.flyway.user"),
                env.getProperty("spring.flyway.password", ""));
        return JdbcClient.create(ds);
    }

    static final UUID LEDGERLY = DemoData.LEDGERLY;
    static final UUID KESTREL = DemoData.KESTREL;
}
