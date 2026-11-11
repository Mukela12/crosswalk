package dev.crosswalk.live;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import dev.crosswalk.security.CwUser;
import dev.crosswalk.security.Tenancy;

/**
 * Server-sent events, one stream per open browser, grouped by tenant. Events only carry
 * what changed; browsers refetch through the normal API, so permissions apply as usual.
 * Single instance: across several instances this would sit on Postgres LISTEN/NOTIFY.
 */
@Component
@RestController
public class LiveHub {

    private static final int MAX_STREAMS_PER_TENANT = 200;
    private static final long TIMEOUT_MS = 15 * 60 * 1000;

    record Payload(String type, String control, String actor, Instant at) {}

    private final Map<UUID, Set<SseEmitter>> streams = new ConcurrentHashMap<>();

    @GetMapping(path = "/api/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe() {
        CwUser user = Tenancy.requireUser();
        Set<SseEmitter> tenantStreams = streams.computeIfAbsent(user.tenantId(), k -> new CopyOnWriteArraySet<>());
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        if (tenantStreams.size() >= MAX_STREAMS_PER_TENANT) {
            emitter.complete();
            return emitter;
        }
        tenantStreams.add(emitter);
        emitter.onCompletion(() -> tenantStreams.remove(emitter));
        emitter.onTimeout(() -> tenantStreams.remove(emitter));
        emitter.onError(e -> tenantStreams.remove(emitter));
        send(tenantStreams, emitter, SseEmitter.event().comment("connected"));
        return emitter;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCommit(LiveEvent event) {
        publish(event);
    }

    /** For changes made outside a request transaction, such as the scheduled demo reset. */
    public void publish(LiveEvent event) {
        Payload payload = new Payload(event.type(), event.control(), event.actor(), Instant.now());
        if (event.tenantId() == null) {
            streams.values().forEach(set -> set.forEach(e -> send(set, e, SseEmitter.event().name("change").data(payload))));
            return;
        }
        Set<SseEmitter> set = streams.get(event.tenantId());
        if (set != null) {
            set.forEach(e -> send(set, e, SseEmitter.event().name("change").data(payload)));
        }
    }

    /** Keeps idle connections open through proxies (Cloudflare closes them after 100 seconds). */
    @Scheduled(fixedRate = 25_000)
    void heartbeat() {
        streams.values().forEach(set -> set.forEach(e -> send(set, e, SseEmitter.event().comment("ping"))));
    }

    private static void send(Set<SseEmitter> set, SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            emitter.send(event);
        } catch (IOException | IllegalStateException e) {
            set.remove(emitter);
        }
    }
}
