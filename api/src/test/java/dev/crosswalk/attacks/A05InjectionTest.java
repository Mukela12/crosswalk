package dev.crosswalk.attacks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

@DisplayName("A05:2025 Injection")
class A05InjectionTest extends AttackTest {

    @ParameterizedTest(name = "search payload {0}")
    @ValueSource(strings = {"' OR '1'='1", "'; drop table evidence; --", "%", "_", "\\", "IAM' UNION SELECT password_hash FROM app_user --"})
    @DisplayName("SQL payloads in the control search are matched as plain text")
    void sqlInjectionInSearch(String payload) throws Exception {
        mvc.perform(get("/api/controls").param("q", payload).session(signIn(NADIA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        assertThat(evidenceCount(LEDGERLY)).isPositive();
    }

    @Test
    @DisplayName("Script in an evidence title is stored as text and served as JSON, never HTML")
    void storedXssIsInert() throws Exception {
        var nadia = signIn(NADIA);
        String script = "<img src=x onerror=alert(document.cookie)>";
        mvc.perform(upload("IAM-01", pdf("x.pdf"), nadia, script, LocalDate.now().minusDays(1), LocalDate.now().plusDays(90)))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/controls/IAM-01").session(nadia))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.evidence[*].title").value(org.hamcrest.Matchers.hasItem(script)));
    }

    @Test
    @DisplayName("javascript: and data: links are refused as evidence")
    void scriptUrlsRefused() throws Exception {
        var nadia = signIn(NADIA);
        for (String url : new String[]{"javascript:alert(1)", "data:text/html,<script>alert(1)</script>",
                "http://insecure.example/policy", "https://user:pass@evil.example/"}) {
            mvc.perform(multipart("/api/controls/IAM-01/evidence").with(csrf()).session(nadia)
                            .param("title", "Policy link")
                            .param("url", url)
                            .param("collectedOn", LocalDate.now().minusDays(1).toString())
                            .param("expiresOn", LocalDate.now().plusDays(90).toString()))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    @DisplayName("Spreadsheet formulas in evidence titles are defused in the CSV export")
    void csvFormulaInjection() throws Exception {
        var nadia = signIn(NADIA);
        mvc.perform(upload("IAM-01", pdf("x.pdf"), nadia, "=HYPERLINK(\"https://evil.example\",\"Open\")",
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(90)))
                .andExpect(status().isCreated());
        byte[] csv = mvc.perform(get("/api/reports/SOC2").session(nadia))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        String text = new String(csv, StandardCharsets.UTF_8);
        assertThat(text).contains("HYPERLINK");
        // No cell may start with a formula character once unquoted.
        assertThat(text).doesNotContainPattern("(^|,)\"[=+@-]");
    }
}
