package dev.crosswalk.security;

import java.sql.PreparedStatement;
import java.util.UUID;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.Session;
import org.springframework.orm.jpa.EntityManagerHolder;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The single place where the tenant reaches the database.
 *
 * Every transaction begins by setting app.tenant_id for that transaction only
 * (set_config with is_local = true), taken from the signed-in user. Row-level
 * security policies read it through app_tenant(). With no user it is set to
 * empty, which matches no rows, so a missing context fails closed.
 */
public class TenantScopedTransactionManager extends JpaTransactionManager {

    public TenantScopedTransactionManager(EntityManagerFactory emf) {
        super(emf);
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
        super.doBegin(transaction, definition);
        UUID tenantId = Tenancy.tenantIdOrNull();
        EntityManagerHolder holder =
                (EntityManagerHolder) TransactionSynchronizationManager.getResource(obtainEntityManagerFactory());
        holder.getEntityManager().unwrap(Session.class).doWork(connection -> {
            try (PreparedStatement ps = connection.prepareStatement("select set_config('app.tenant_id', ?, true)")) {
                ps.setString(1, tenantId == null ? "" : tenantId.toString());
                ps.execute();
            }
        });
    }
}
