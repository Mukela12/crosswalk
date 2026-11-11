package dev.crosswalk.evidence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

interface EvidenceRepository extends JpaRepository<Evidence, UUID> {

    // Scoped to the tenant by row-level security, not by a where clause.
    List<Evidence> findByControlIdOrderByExpiresOnDesc(int controlId);
}
