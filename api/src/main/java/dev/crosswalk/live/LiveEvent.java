package dev.crosswalk.live;

import java.util.UUID;

/** Published inside a transaction, delivered to the tenant's open browsers after it commits. */
public record LiveEvent(UUID tenantId, String type, String control, String actor) {}
