package dev.crosswalk.attacks;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("A02:2025 Security Misconfiguration + A10:2025 Mishandling of Exceptional Conditions")
class A02SecurityMisconfigurationTest extends AttackTest {

    @Test
    @DisplayName("API responses carry the hardening headers")
    void securityHeaders() throws Exception {
        mvc.perform(get("/api/overview").session(signIn(NADIA)))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().string("Content-Security-Policy", Matchers.containsString("frame-ancestors 'none'")))
                .andExpect(header().string("Cache-Control", Matchers.containsString("no-store")));
    }

    @Test
    @DisplayName("Only the health endpoint is exposed; actuator internals are not")
    void actuatorLockedDown() throws Exception {
        mvc.perform(get("/healthz")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
        for (String path : new String[]{"/env", "/actuator/env", "/heapdump", "/beans", "/configprops", "/mappings"}) {
            mvc.perform(get(path)).andExpect(status().is4xxClientError());
        }
    }

    @Test
    @DisplayName("A bad id gives a short JSON error with no stack trace, SQL or class names")
    void errorsDontLeak() throws Exception {
        String body = mvc.perform(get("/api/evidence/not-a-uuid/file").session(signIn(NADIA)))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body)
                .doesNotContain("Exception").doesNotContain("java.").doesNotContain("SQL").doesNotContain("at dev.");
    }

    @Test
    @DisplayName("Unknown controls are a clean 404")
    void unknownControl() throws Exception {
        mvc.perform(get("/api/controls/NOPE-99").session(signIn(NADIA)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Control not found"));
    }
}
