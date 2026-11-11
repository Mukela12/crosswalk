package dev.crosswalk.audit;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
class AuditController {

    private final AuditService audit;

    AuditController(AuditService audit) {
        this.audit = audit;
    }

    @GetMapping("/api/audit")
    List<AuditService.AuditView> list(@RequestParam(defaultValue = "200") int limit) {
        return audit.recent(limit);
    }
}
