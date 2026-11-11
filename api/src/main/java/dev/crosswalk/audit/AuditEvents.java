package dev.crosswalk.audit;

import java.util.List;

import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

interface AuditEvents extends JpaRepository<AuditEvent, Long> {

    // No tenant filter on purpose: row-level security scopes every read.
    List<AuditEvent> findByOrderByAtDescIdDesc(Limit limit);
}
