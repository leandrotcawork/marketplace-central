export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div
        className="rounded-2xl border px-6 py-6"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
      >
        <h1
          className="text-xl font-semibold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
        >
          Politica de Privacidade
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Esta pagina descreve como o Marketplace Central coleta, usa e protege os dados
          compartilhados durante as integracoes com marketplaces.
        </p>

        <div className="mt-6 flex flex-col gap-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <section>
            <h2
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
            >
              1. Dados coletados
            </h2>
            <p className="mt-1">
              Coletamos apenas os dados necessarios para operar as integracoes e gerar analises
              comerciais, como informacoes de produtos, precos, estoques e pedidos.
            </p>
          </section>

          <section>
            <h2
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
            >
              2. Uso das informacoes
            </h2>
            <p className="mt-1">
              As informacoes sao usadas para sincronizacao com marketplaces, simulacoes de margem,
              configuracao de frete e suporte operacional.
            </p>
          </section>

          <section>
            <h2
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
            >
              3. Compartilhamento
            </h2>
            <p className="mt-1">
              Nao vendemos dados. Compartilhamos informacoes apenas com os marketplaces integrados
              e provedores tecnicos estritamente necessarios para a operacao.
            </p>
          </section>

          <section>
            <h2
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
            >
              4. Seguranca
            </h2>
            <p className="mt-1">
              Credenciais e tokens sao armazenados de forma protegida. Acesso interno e controlado
              por perfis e trilhas de auditoria.
            </p>
          </section>

          <section>
            <h2
              className="text-sm font-semibold"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-dm-sans)' }}
            >
              5. Contato
            </h2>
            <p className="mt-1">
              Para duvidas, fale com o time responsavel pelo Marketplace Central.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
