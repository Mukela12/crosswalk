package dev.crosswalk.attacks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("A01:2025 Broken Access Control")
class A01BrokenAccessControlTest extends AttackTest {

    @Test
    @DisplayName("Signed-out callers get 401 on every API route")
    void anonymousIsRejected() throws Exception {
        for (String path : new String[]{"/api/overview", "/api/controls", "/api/controls/IAM-01", "/api/audit",
                "/api/events", "/api/reports/SOC2"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
        // Signed out, the session endpoint says "nobody" without revealing anything.
        mvc.perform(get("/api/session")).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("Kestrel can't download a Ledgerly evidence file by guessing its id")
    void crossTenantFileDownload() throws Exception {
        UUID ledgerlyFile = anyEvidenceOf(LEDGERLY);
        mvc.perform(get("/api/evidence/" + ledgerlyFile + "/file").session(signIn(IMANI)))
                .andExpect(status().isNotFound());
        // The owner still can.
        mvc.perform(get("/api/evidence/" + ledgerlyFile + "/file").session(signIn(NADIA)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Kestrel can't delete Ledgerly evidence, and the row survives")
    void crossTenantDelete() throws Exception {
        UUID ledgerlyFile = anyEvidenceOf(LEDGERLY);
        int before = evidenceCount(LEDGERLY);
        mvc.perform(delete("/api/evidence/" + ledgerlyFile).with(csrf()).session(signIn(IMANI)))
                .andExpect(status().isNotFound());
        assertThat(evidenceCount(LEDGERLY)).isEqualTo(before);
    }

    @Test
    @DisplayName("Kestrel never sees Ledgerly's frameworks, evidence or audit trail")
    void crossTenantReadsAreScoped() throws Exception {
        var kestrel = signIn(IMANI);
        mvc.perform(get("/api/overview").session(kestrel))
                .andExpect(jsonPath("$.frameworks[*].code").value(org.hamcrest.Matchers.containsInAnyOrder("SOC2", "HIPAA")));
        mvc.perform(get("/api/audit").session(kestrel))
                .andExpect(jsonPath("$[*].actor").value(org.hamcrest.Matchers.everyItem(
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.isOneOf("Nadia Brooks", "Tomas Lindqvist")))));
        // PCI DSS is in Ledgerly's scope, not Kestrel's.
        mvc.perform(get("/api/reports/PCIDSS").session(kestrel)).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("The auditor role can read but not add or remove evidence")
    void auditorIsReadOnly() throws Exception {
        var auditor = signIn(TOMAS);
        mvc.perform(get("/api/controls/IAM-01").session(auditor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.canEdit").value(false));
        mvc.perform(upload("IAM-01", pdf("policy.pdf"), auditor)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/evidence/" + anyEvidenceOf(LEDGERLY)).with(csrf()).session(auditor))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Extra form fields can't move evidence into another tenant or change its author")
    void massAssignmentIsIgnored() throws Exception {
        var nadia = signIn(NADIA);
        int kestrelBefore = evidenceCount(KESTREL);
        mvc.perform(upload("IAM-01", pdf("mfa.pdf"), nadia)
                        .param("tenantId", KESTREL.toString())
                        .param("tenant_id", KESTREL.toString())
                        .param("createdBy", UUID.randomUUID().toString())
                        .param("role", "LEAD"))
                .andExpect(status().isCreated());
        assertThat(evidenceCount(KESTREL)).isEqualTo(kestrelBefore);
        String author = demoOwnerJdbc().sql("""
                select u.email from evidence e join app_user u on u.id = e.created_by
                where e.tenant_id = ? and e.title = 'Uploaded evidence'
                """).param(LEDGERLY).query(String.class).single();
        assertThat(author).isEqualTo(NADIA);
    }
}
