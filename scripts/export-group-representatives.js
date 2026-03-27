/**
 * Cole este script no Console do browser (F12 → Console) com o app aberto.
 * Ele lê as classificações do localStorage, chama a API e baixa o .md.
 */
;(async () => {
  // 1. Ler classificações do localStorage
  const raw = localStorage.getItem('mc-classifications')
  if (!raw) { console.error('Nenhuma classificação encontrada no localStorage'); return }

  const store = JSON.parse(raw)
  const classifications = store?.state?.classifications || []

  if (classifications.length === 0) { console.error('Nenhuma classificação cadastrada'); return }

  console.log(`Encontradas ${classifications.length} classificações:`)
  classifications.forEach(c => console.log(`  - ${c.name}: ${c.productIds.length} produtos`))

  // 2. Juntar todos os product IDs (únicos)
  const allIds = [...new Set(classifications.flatMap(c => c.productIds))]
  console.log(`\nTotal de ${allIds.length} produtos únicos nas classificações`)

  // 3. Chamar a API
  const url = `/api/products/group-representatives?productIds=${allIds.join(',')}`
  console.log('Chamando API...')
  const res = await fetch(url)
  const payload = await res.json()

  if (!payload.success) { console.error('Erro na API:', payload.error); return }

  const data = payload.data
  console.log(`API retornou ${data.length} grupos com representante EAN`)

  // 4. Montar o markdown
  const classNames = classifications.map(c => c.name).join(', ')
  let md = `# Representantes por Grupo — Classificações\n\n`
  md += `> Gerado em ${new Date().toISOString().slice(0,10)}\n`
  md += `> Classificações: ${classNames}\n`
  md += `> Produtos no escopo: ${allIds.length} | Grupos com EAN: ${data.length}\n\n`
  md += `| # | Grupo | PN | Produto | EAN | Referência |\n`
  md += `|---|-------|-----|---------|-----|------------|\n`

  data.forEach((row, i) => {
    md += `| ${i + 1} | ${row.grupo} | ${row.pn} | ${row.name} | ${row.ean} | ${row.referencia || '-'} |\n`
  })

  md += `\n---\n\n**Total: ${data.length} grupos**\n`

  // 5. Baixar o arquivo
  const blob = new Blob([md], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'representantes-classificacoes.md'
  a.click()
  URL.revokeObjectURL(a.href)

  console.log('\n✅ Arquivo representantes-classificacoes.md baixado!')

  // 6. Também copia para o clipboard
  await navigator.clipboard.writeText(md)
  console.log('📋 Conteúdo também copiado para o clipboard')
})()
