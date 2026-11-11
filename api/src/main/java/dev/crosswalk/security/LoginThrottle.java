package dev.crosswalk.security;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Server-side brute-force limit, behind the edge rate limit.
 *
 * Keyed by client IP + email (5 failures per 15 minutes) and by IP alone
 * (30 failures per 15 minutes, for credential stuffing across many emails).
 * It never locks the account itself, so nobody can lock a real user out.
 */
@Component
public class LoginThrottle {

    static final int MAX_PER_ACCOUNT = 5;
    static final int MAX_PER_IP = 30;
    static final Duration WINDOW = Duration.ofMinutes(15);

    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();
    private final Clock clock = Clock.systemUTC();

    public Optional<Duration> blockedFor(String ip, String email) {
        Instant now = clock.instant();
        Optional<Duration> account = check(accountKey(ip, email), MAX_PER_ACCOUNT, now);
        return account.isPresent() ? account : check(ipKey(ip), MAX_PER_IP, now);
    }

    public void recordFailure(String ip, String email) {
        Instant now = clock.instant();
        add(accountKey(ip, email), now);
        add(ipKey(ip), now);
    }

    public void recordSuccess(String ip, String email) {
        failures.remove(accountKey(ip, email));
    }

    private Optional<Duration> check(String key, int max, Instant now) {
        Deque<Instant> times = failures.get(key);
        if (times == null) {
            return Optional.empty();
        }
        synchronized (times) {
            prune(times, now);
            if (times.size() < max) {
                return Optional.empty();
            }
            return Optional.of(Duration.between(now, times.peekFirst().plus(WINDOW)));
        }
    }

    private void add(String key, Instant now) {
        Deque<Instant> times = failures.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (times) {
            prune(times, now);
            times.addLast(now);
        }
    }

    private static void prune(Deque<Instant> times, Instant now) {
        while (!times.isEmpty() && times.peekFirst().isBefore(now.minus(WINDOW))) {
            times.pollFirst();
        }
    }

    @Scheduled(fixedRate = 300_000)
    void evictExpired() {
        Instant now = clock.instant();
        failures.entrySet().removeIf(e -> {
            synchronized (e.getValue()) {
                prune(e.getValue(), now);
                return e.getValue().isEmpty();
            }
        });
    }

    private static String accountKey(String ip, String email) {
        return "acct|" + ip + "|" + (email == null ? "" : email.trim().toLowerCase());
    }

    private static String ipKey(String ip) {
        return "ip|" + ip;
    }
}
