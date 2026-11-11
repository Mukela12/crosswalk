package dev.crosswalk.config;

import javax.sql.DataSource;

import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import dev.crosswalk.security.TenantScopedTransactionManager;

@Configuration
@EnableScheduling
public class PersistenceConfig {

    /** Replaces Boot's default JpaTransactionManager so every transaction is tenant-scoped. */
    @Bean
    TenantScopedTransactionManager transactionManager(EntityManagerFactory emf, DataSource dataSource) {
        TenantScopedTransactionManager tm = new TenantScopedTransactionManager(emf);
        tm.setDataSource(dataSource);
        return tm;
    }
}
