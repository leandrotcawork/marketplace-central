package providers

import "marketplace-central/apps/server_core/internal/modules/integrations/domain"

type Registry struct {
	definitions []domain.ProviderDefinition
}

func NewRegistry() *Registry {
	return &Registry{
		definitions: []domain.ProviderDefinition{
			{
				ProviderCode: "mercado_livre",
				TenantID:     "system",
				Family:       domain.IntegrationFamilyMarketplace,
				DisplayName:  "Mercado Livre",
				AuthStrategy: domain.AuthStrategyOAuth2,
				InstallMode:  domain.InstallModeInteractive,
				Metadata: map[string]any{
					"country":       "BR",
					"release_stage": "stable",
				},
				DeclaredCapabilities: []string{
					"catalog_publish",
					"pricing_fee_sync",
					"inventory_sync",
					"order_read",
					"message_read",
					"message_reply",
					"shipment_tracking",
					"webhook_receive",
				},
				IsActive: true,
			},
			{
				ProviderCode: "magalu",
				TenantID:     "system",
				Family:       domain.IntegrationFamilyMarketplace,
				DisplayName:  "Magalu",
				AuthStrategy: domain.AuthStrategyOAuth2,
				InstallMode:  domain.InstallModeInteractive,
				Metadata: map[string]any{
					"country":       "BR",
					"release_stage": "stable",
				},
				DeclaredCapabilities: []string{
					"catalog_publish",
					"pricing_fee_sync",
					"inventory_sync",
					"order_read",
					"message_read",
					"shipment_tracking",
					"webhook_receive",
				},
				IsActive: true,
			},
			{
				ProviderCode: "shopee",
				TenantID:     "system",
				Family:       domain.IntegrationFamilyMarketplace,
				DisplayName:  "Shopee",
				AuthStrategy: domain.AuthStrategyAPIKey,
				InstallMode:  domain.InstallModeManual,
				Metadata: map[string]any{
					"country":       "BR",
					"release_stage": "limited",
				},
				DeclaredCapabilities: []string{
					"catalog_publish",
					"pricing_fee_sync",
					"inventory_sync",
					"order_read",
					"message_read",
					"shipment_tracking",
				},
				IsActive: true,
			},
		},
	}
}

func (r *Registry) All() []domain.ProviderDefinition {
	if r == nil || len(r.definitions) == 0 {
		return nil
	}

	out := make([]domain.ProviderDefinition, len(r.definitions))
	for i := range r.definitions {
		out[i] = cloneProviderDefinition(r.definitions[i])
	}
	return out
}

func cloneProviderDefinition(def domain.ProviderDefinition) domain.ProviderDefinition {
	cloned := def

	if def.DeclaredCapabilities != nil {
		cloned.DeclaredCapabilities = append([]string(nil), def.DeclaredCapabilities...)
	}

	if def.Metadata != nil {
		cloned.Metadata = make(map[string]any, len(def.Metadata))
		for key, value := range def.Metadata {
			cloned.Metadata[key] = cloneAny(value)
		}
	}

	return cloned
}

func cloneAny(value any) any {
	switch v := value.(type) {
	case map[string]any:
		cloned := make(map[string]any, len(v))
		for key, nested := range v {
			cloned[key] = cloneAny(nested)
		}
		return cloned
	case []any:
		cloned := make([]any, len(v))
		for i := range v {
			cloned[i] = cloneAny(v[i])
		}
		return cloned
	case []string:
		return append([]string(nil), v...)
	default:
		return value
	}
}
