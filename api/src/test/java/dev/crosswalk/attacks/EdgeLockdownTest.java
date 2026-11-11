package dev.crosswalk.attacks;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;

/** With EDGE_SECRET set, the API answers only requests that came through the Cloudflare Worker. */
@DisplayName("A02:2025 Origin lockdown behind the edge")
@TestPropertySource(properties = "crosswalk.edge-secret=test-edge-secret")
class EdgeLockdownTest extends AttackTest {

    @Test
    @DisplayName("Calling the origin directly, without the edge header, is refused")
    void directOriginRefused() throws Exception {
        mvc.perform(get("/api/csrf")).andExpect(status().isForbidden());
        mvc.perform(get("/api/csrf").header("X-Edge-Auth", "guessed")).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Requests carrying the edge secret go through")
    void edgeAllowed() throws Exception {
        mvc.perform(get("/api/csrf").header("X-Edge-Auth", "test-edge-secret")).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("The platform health check still works without the header")
    void healthOpen() throws Exception {
        mvc.perform(get("/healthz")).andExpect(status().isOk());
    }
}
