package dev.crosswalk.attacks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import java.util.stream.Collectors;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** The product promise, tested: one piece of evidence moves every framework the control maps to. */
@DisplayName("Crosswalk: one evidence item counts toward every mapped framework")
class CrosswalkBehaviourTest extends AttackTest {

    @Test
    @DisplayName("Evidence for a missing control raises SOC 2, ISO 27001 and PCI DSS together, and is audited")
    void oneEvidenceManyFrameworks() throws Exception {
        var nadia = signIn(NADIA);
        String control = firstMissing(nadia);
        Map<String, Integer> before = covered(nadia);

        mvc.perform(upload(control, pdf("evidence.pdf"), nadia)).andExpect(status().isCreated());

        Map<String, Integer> after = covered(nadia);
        String detail = mvc.perform(get("/api/controls/" + control).session(nadia))
                .andReturn().getResponse().getContentAsString();
        java.util.List<String> frameworks = JsonPath.read(detail, "$.control.refs[*].framework");
        for (String fw : frameworks.stream().distinct().toList()) {
            assertThat(after.get(fw)).as(fw).isGreaterThanOrEqualTo(before.get(fw));
        }
        assertThat(after.values().stream().mapToInt(i -> i).sum())
                .isGreaterThan(before.values().stream().mapToInt(i -> i).sum());
        assertThat((String) JsonPath.read(detail, "$.control.status")).isEqualTo("MET");

        String audit = mvc.perform(get("/api/audit").param("limit", "1").session(nadia))
                .andReturn().getResponse().getContentAsString();
        assertThat((String) JsonPath.read(audit, "$[0].action")).isEqualTo("EVIDENCE_ADDED");
        assertThat((String) JsonPath.read(audit, "$[0].control")).isEqualTo(control);
    }

    private String firstMissing(org.springframework.mock.web.MockHttpSession s) throws Exception {
        java.util.List<String> codes = JsonPath.read(mvc.perform(get("/api/controls").session(s))
                .andReturn().getResponse().getContentAsString(), "$[?(@.status == 'MISSING')].code");
        assertThat(codes).isNotEmpty();
        return codes.getFirst();
    }

    private Map<String, Integer> covered(org.springframework.mock.web.MockHttpSession s) throws Exception {
        String json = mvc.perform(get("/api/overview").session(s)).andReturn().getResponse().getContentAsString();
        java.util.List<Map<String, Object>> fws = JsonPath.read(json, "$.frameworks");
        return fws.stream().collect(Collectors.toMap(f -> (String) f.get("code"), f -> (Integer) f.get("covered")));
    }
}
