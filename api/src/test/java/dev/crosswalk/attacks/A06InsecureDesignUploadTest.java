package dev.crosswalk.attacks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

@DisplayName("A06:2025 Insecure Design: file uploads")
class A06InsecureDesignUploadTest extends AttackTest {

    @Test
    @DisplayName("HTML renamed to .pdf is rejected: the type comes from the bytes, not the name")
    void disguisedHtml() throws Exception {
        var html = new MockMultipartFile("file", "policy.pdf", "application/pdf",
                "<html><script>alert(1)</script></html>".getBytes());
        mvc.perform(upload("IAM-01", html, signIn(NADIA))).andExpect(status().isUnsupportedMediaType());
    }

    @Test
    @DisplayName("Files over 2 MB are rejected")
    void oversized() throws Exception {
        byte[] big = new byte[2 * 1024 * 1024 + 1];
        System.arraycopy("%PDF-".getBytes(), 0, big, 0, 5);
        var file = new MockMultipartFile("file", "big.pdf", "application/pdf", big);
        mvc.perform(upload("IAM-01", file, signIn(NADIA))).andExpect(status().isContentTooLarge());
    }

    @Test
    @DisplayName("Path traversal in the file name is stripped")
    void pathTraversalName() throws Exception {
        var file = new MockMultipartFile("file", "../../etc/passwd.pdf", "application/pdf", "%PDF-1.4\n".getBytes());
        mvc.perform(upload("IAM-01", file, signIn(NADIA)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fileName").value("passwd.pdf"));
    }

    @Test
    @DisplayName("A crafted file name built to cause regex backtracking is cleaned in linear time")
    void fileNameRedos() throws Exception {
        String crafted = "a" + "-.".repeat(50_000) + "!" + "x".repeat(10) + ".pdf";
        var file = new MockMultipartFile("file", crafted, "application/pdf", "%PDF-1.4\n".getBytes());
        var nadia = signIn(NADIA);
        org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(java.time.Duration.ofSeconds(2), () ->
                mvc.perform(upload("IAM-01", file, nadia))
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.fileName").value(org.hamcrest.Matchers.endsWith(".pdf"))));
    }

    @Test
    @DisplayName("Downloads are attachments with nosniff and a sandbox CSP")
    void downloadHeaders() throws Exception {
        var res = mvc.perform(get("/api/evidence/" + anyEvidenceOf(LEDGERLY) + "/file").session(signIn(NADIA)))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andReturn().getResponse();
        assertThat(res.getHeader("Content-Disposition")).startsWith("attachment;");
        assertThat(res.getHeader("Content-Security-Policy")).contains("sandbox");
        assertThat(res.getContentAsByteArray()).startsWith("%PDF-".getBytes());
    }

    @Test
    @DisplayName("Evidence needs exactly one of a file or a link, and sane dates")
    void validation() throws Exception {
        var nadia = signIn(NADIA);
        mvc.perform(upload("IAM-01", null, nadia)).andExpect(status().isBadRequest());
        mvc.perform(upload("IAM-01", pdf("a.pdf"), nadia).param("url", "https://drive.example/a"))
                .andExpect(status().isBadRequest());
        mvc.perform(upload("IAM-01", pdf("a.pdf"), nadia, "Old", java.time.LocalDate.now().minusDays(1),
                        java.time.LocalDate.of(2020, 1, 1)))
                .andExpect(status().isBadRequest());
    }
}
