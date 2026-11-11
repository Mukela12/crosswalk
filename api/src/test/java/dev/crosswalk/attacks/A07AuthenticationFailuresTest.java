package dev.crosswalk.attacks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@DisplayName("A07:2025 Authentication Failures")
class A07AuthenticationFailuresTest extends AttackTest {

    private MockHttpServletRequestBuilder login(String email, String password, String ip) {
        return post("/api/session").with(csrf()).with(r -> {
                    r.setRemoteAddr(ip);
                    return r;
                })
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
    }

    @Test
    @DisplayName("Unknown email and wrong password get the identical answer (no account enumeration)")
    void noEnumeration() throws Exception {
        String wrongPassword = mvc.perform(login(NADIA, "not-the-password", "10.0.0.11"))
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        String unknownEmail = mvc.perform(login("nobody@ledgerly.example", "not-the-password", "10.0.0.11"))
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        assertThat(unknownEmail).isEqualTo(wrongPassword);
    }

    @Test
    @DisplayName("The sixth wrong password from one IP is throttled with Retry-After, even if correct")
    void bruteForceIsThrottled() throws Exception {
        for (int i = 0; i < 5; i++) {
            mvc.perform(login(NADIA, "guess-" + i, "10.0.0.12")).andExpect(status().isUnauthorized());
        }
        mvc.perform(login(NADIA, PASSWORD, "10.0.0.12"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"));
        // Another IP isn't blocked, so an attacker can't lock the real user out.
        mvc.perform(login(NADIA, PASSWORD, "10.0.0.13")).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Signing in issues a new session id (session fixation)")
    void sessionFixation() throws Exception {
        MockHttpSession planted = new MockHttpSession();
        String plantedId = planted.getId();
        // The browser presents the planted id as its session cookie, as a fixation victim's would.
        var result = mvc.perform(login(NADIA, PASSWORD, "10.0.0.14").session(planted).with(r -> {
                    r.setRequestedSessionId(plantedId);
                    r.setRequestedSessionIdValid(true);
                    return r;
                }))
                .andExpect(status().isOk()).andReturn();
        assertThat(result.getRequest().getSession(false).getId()).isNotEqualTo(plantedId);
    }

    @Test
    @DisplayName("State-changing requests without the CSRF token are refused, sign-in included")
    void csrfRequired() throws Exception {
        mvc.perform(post("/api/session").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + NADIA + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isForbidden());
        var nadia = signIn(NADIA);
        mvc.perform(delete("/api/evidence/" + anyEvidenceOf(LEDGERLY)).session(nadia))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/evidence/" + anyEvidenceOf(LEDGERLY)).with(csrf().useInvalidToken()).session(nadia))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Signing out ends the session server-side")
    void logoutInvalidates() throws Exception {
        var nadia = signIn(NADIA);
        mvc.perform(get("/api/session").session(nadia)).andExpect(status().isOk());
        mvc.perform(post("/api/logout").with(csrf()).session(nadia)).andExpect(status().isNoContent());
        assertThat(nadia.isInvalid()).isTrue();
    }

    @Test
    @DisplayName("Malformed sign-in bodies get a 400 without detail")
    void malformedLogin() throws Exception {
        mvc.perform(post("/api/session").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"email\":"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("The request couldn't be read"));
    }
}
