import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import XLSX from 'xlsx';
import pg from 'pg';

const { Client } = pg;

const HEADER_ROW_INDEX = 2;
const DATA_START_ROW_INDEX = 3;
const DEFAULT_TIMEZONE_OFFSET = '-03:00';
const DEFAULT_SOURCE_SYSTEM = 'legacy_import_v1';
const DEFAULT_ORIGIN_TYPE = 'import';
const DEFAULT_ORIGIN_REF = 'legacy:metalshopping_db.product_erp';
const DEFAULT_REASON_CODE = 'legacy_migration_v1';
const DEFAULT_UPDATED_BY = 'system:legacy_pricing_inventory_import_v1';

function parseArgs(argv) {
  const args = {
    apply: false,
    file: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg === '--file') {
      args.file = argv[i + 1] || '';
      i += 1;
      continue;
    }
  }

  return args;
}

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) {
    return env;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('#')) {
      continue;
    }
    const idx = line.indexOf('=');
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }

  return env;
}

function toString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function toNullableString(value) {
  const text = toString(value);
  return text || null;
}

function toNumber(value) {
  if (typeof value === 'number') {
    return value;
  }

  const text = toString(value);
  if (!text) {
    return 0;
  }

  const cleaned = text.replace(/[^\d.,\-]/g, '').trim();
  if (!cleaned) {
    return 0;
  }

  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.includes(',')
      ? cleaned.replace(',', '.')
      : cleaned;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTimestamp(value) {
  const text = toString(value);
  if (!text) {
    return null;
  }

  const [datePart, timePart = '00:00'] = text.split(' ');
  const [day, month, year] = datePart.split('/');
  if (!day || !month || !year) {
    return null;
  }

  const [hour = '00', minute = '00'] = timePart.split(':');
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00${DEFAULT_TIMEZONE_OFFSET}`);
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

function parseWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error('Arquivo XLS sem abas.');
  }

  const sheet = workbook.Sheets[firstSheet];
  const formattedMatrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });
  const rawMatrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  const headers = formattedMatrix[HEADER_ROW_INDEX];
  if (!Array.isArray(headers) || headers.length === 0) {
    throw new Error('Não foi possível localizar o cabeçalho da planilha.');
  }

  const rows = [];

  for (let rowIndex = DATA_START_ROW_INDEX; rowIndex < formattedMatrix.length; rowIndex += 1) {
    const formattedRow = formattedMatrix[rowIndex];
    const rawRow = rawMatrix[rowIndex] || [];
    if (!Array.isArray(formattedRow)) {
      continue;
    }
    if (!formattedRow.some((value) => value !== null && value !== '')) {
      continue;
    }

    const formatted = Object.fromEntries(
      headers.map((header, index) => [header, formattedRow[index] ?? null])
    );
    const raw = Object.fromEntries(
      headers.map((header, index) => [header, rawRow[index] ?? null])
    );

    if (!toString(formatted.PN_INTERNO)) {
      continue;
    }
    if (toString(formatted.ENCONTRADO_NO_SANKHYA).toUpperCase() !== 'SIM') {
      continue;
    }
    if (toString(formatted.DIAGNOSTICO) !== 'OK_PARA_EXPORTAR') {
      continue;
    }

    rows.push({
      sku: toString(formatted.PN_INTERNO),
      pnInterno: toString(formatted.PN_INTERNO),
      reference: toNullableString(formatted.REFERENCIA),
      ean: toNullableString(formatted.EAN),
      name: toString(formatted.DESCRICAO),
      brandName: toNullableString(formatted.MARCA),
      stockProfileCode: toNullableString(formatted.TIPO_ESTOQUE),
      taxonomyGroup: toNullableString(formatted.GRUPO_PRODUTO),
      priceAmount: toNumber(raw.PRECO_INTERNO ?? formatted.PRECO_INTERNO),
      replacementCostAmount: toNumber(raw.CUSTO_VARIAVEL_NUM ?? formatted.CUSTO_VARIAVEL_NUM),
      averageCostAmount: toNumber(raw.CUSTO_MEDIO_NUM ?? formatted.CUSTO_MEDIO_NUM),
      onHandQuantity: toNumber(raw.ESTOQUE_DISPONIVEL ?? formatted.ESTOQUE_DISPONIVEL),
      lastPurchaseAt: toTimestamp(formatted.DT_COMPRA),
      lastSaleAt: toTimestamp(formatted.DT_VENDA),
      description: toString(formatted.DESCRICAO),
    });
  }

  return rows;
}

async function loadTaxonomyMap(client, groups) {
  const uniqueGroups = [...new Set(groups.filter(Boolean))];
  const taxonomyMap = new Map();

  if (uniqueGroups.length === 0) {
    return taxonomyMap;
  }

  const res = await client.query(
    `
      SELECT taxonomy_node_id, name
      FROM catalog_taxonomy_nodes
      WHERE is_active = true
        AND name = ANY($1::text[])
    `,
    [uniqueGroups]
  );

  for (const row of res.rows) {
    taxonomyMap.set(row.name, row.taxonomy_node_id);
  }

  const missing = uniqueGroups.filter((group) => !taxonomyMap.has(group));
  if (missing.length > 0) {
    throw new Error(`Taxonomias não encontradas: ${missing.join(', ')}`);
  }

  return taxonomyMap;
}

function buildConnectionString(env) {
  return env.MS_DATABASE_URL ||
    `postgres://${env.PGUSER}:${env.PGPASSWORD}@${env.PGHOST}:${env.PGPORT}/${env.PGDATABASE}?sslmode=${env.PGSSLMODE || 'disable'}`;
}

async function loadExistingState(client, tenantId, skus, pnInternos, references, eans) {
  const [productsRes, identifiersRes] = await Promise.all([
    client.query(
      `
        SELECT product_id, sku
        FROM catalog_products
        WHERE tenant_id = $1
          AND sku = ANY($2::text[])
      `,
      [tenantId, skus]
    ),
    client.query(
      `
        SELECT product_id, identifier_type, identifier_value, is_primary
        FROM catalog_product_identifiers
        WHERE tenant_id = $1
          AND (
            (identifier_type = 'pn_interno' AND identifier_value = ANY($2::text[]))
            OR (identifier_type = 'reference' AND identifier_value = ANY($3::text[]))
            OR (identifier_type = 'ean' AND identifier_value = ANY($4::text[]))
          )
      `,
      [tenantId, pnInternos, references, eans]
    ),
  ]);

  const productBySku = new Map(productsRes.rows.map((row) => [row.sku, row.product_id]));
  const identifierKeys = new Set(
    identifiersRes.rows.map((row) => `${row.identifier_type}:${row.identifier_value}`)
  );

  const productIds = productsRes.rows.map((row) => row.product_id);
  let priceKeys = new Set();
  let inventoryKeys = new Set();

  if (productIds.length > 0) {
    const [priceRes, inventoryRes] = await Promise.all([
      client.query(
        `
          SELECT product_id
          FROM pricing_product_prices
          WHERE tenant_id = $1
            AND effective_to IS NULL
            AND product_id = ANY($2::text[])
        `,
        [tenantId, productIds]
      ),
      client.query(
        `
          SELECT product_id
          FROM inventory_product_positions
          WHERE tenant_id = $1
            AND effective_to IS NULL
            AND product_id = ANY($2::text[])
        `,
        [tenantId, productIds]
      ),
    ]);

    priceKeys = new Set(priceRes.rows.map((row) => row.product_id));
    inventoryKeys = new Set(inventoryRes.rows.map((row) => row.product_id));
  }

  return {
    productBySku,
    identifierKeys,
    priceKeys,
    inventoryKeys,
  };
}

async function upsertProduct(client, tenantId, row, taxonomyNodeId, productId) {
  const res = await client.query(
    `
      INSERT INTO catalog_products (
        product_id,
        tenant_id,
        sku,
        name,
        status,
        brand_name,
        stock_profile_code,
        primary_taxonomy_node_id,
        description
      )
      VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8)
      ON CONFLICT (tenant_id, sku)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        brand_name = EXCLUDED.brand_name,
        stock_profile_code = EXCLUDED.stock_profile_code,
        primary_taxonomy_node_id = EXCLUDED.primary_taxonomy_node_id,
        description = EXCLUDED.description,
        updated_at = now()
      RETURNING product_id
    `,
    [
      productId,
      tenantId,
      row.sku,
      row.name,
      row.brandName,
      row.stockProfileCode,
      taxonomyNodeId,
      row.description,
    ]
  );

  return res.rows[0].product_id;
}

async function upsertIdentifier(client, tenantId, productId, identifierType, identifierValue, isPrimary) {
  await client.query(
    `
      INSERT INTO catalog_product_identifiers (
        product_identifier_id,
        product_id,
        tenant_id,
        identifier_type,
        identifier_value,
        source_system,
        is_primary
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT DO NOTHING
    `,
    [
      makeId('pid'),
      productId,
      tenantId,
      identifierType,
      identifierValue,
      DEFAULT_SOURCE_SYSTEM,
      isPrimary,
    ]
  );
}

async function upsertPrice(client, tenantId, productId, row, priceId, effectiveFrom) {
  await client.query(
    `
      INSERT INTO pricing_product_prices (
        price_id,
        tenant_id,
        product_id,
        currency_code,
        price_amount,
        replacement_cost_amount,
        pricing_status,
        effective_from,
        effective_to,
        origin_type,
        origin_ref,
        reason_code,
        updated_by,
        average_cost_amount
      )
      VALUES (
        $1, $2, $3, 'BRL', $4, $5, 'active', $6, NULL, $7, $8, $9, $10, $11
      )
      ON CONFLICT (tenant_id, product_id) WHERE effective_to IS NULL
      DO UPDATE SET
        currency_code = EXCLUDED.currency_code,
        price_amount = EXCLUDED.price_amount,
        replacement_cost_amount = EXCLUDED.replacement_cost_amount,
        pricing_status = EXCLUDED.pricing_status,
        origin_type = EXCLUDED.origin_type,
        origin_ref = EXCLUDED.origin_ref,
        reason_code = EXCLUDED.reason_code,
        updated_by = EXCLUDED.updated_by,
        average_cost_amount = EXCLUDED.average_cost_amount,
        updated_at = now()
    `,
    [
      priceId,
      tenantId,
      productId,
      row.priceAmount,
      row.replacementCostAmount,
      effectiveFrom,
      DEFAULT_ORIGIN_TYPE,
      DEFAULT_ORIGIN_REF,
      DEFAULT_REASON_CODE,
      DEFAULT_UPDATED_BY,
      row.averageCostAmount,
    ]
  );
}

async function upsertInventory(client, tenantId, productId, row, positionId, effectiveFrom) {
  await client.query(
    `
      INSERT INTO inventory_product_positions (
        position_id,
        tenant_id,
        product_id,
        on_hand_quantity,
        last_purchase_at,
        last_sale_at,
        position_status,
        effective_from,
        effective_to,
        origin_type,
        origin_ref,
        reason_code,
        updated_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, 'active', $7, NULL, $8, $9, $10, $11
      )
      ON CONFLICT (tenant_id, product_id) WHERE effective_to IS NULL
      DO UPDATE SET
        on_hand_quantity = EXCLUDED.on_hand_quantity,
        last_purchase_at = EXCLUDED.last_purchase_at,
        last_sale_at = EXCLUDED.last_sale_at,
        position_status = EXCLUDED.position_status,
        origin_type = EXCLUDED.origin_type,
        origin_ref = EXCLUDED.origin_ref,
        reason_code = EXCLUDED.reason_code,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
    `,
    [
      positionId,
      tenantId,
      productId,
      row.onHandQuantity,
      row.lastPurchaseAt,
      row.lastSaleAt,
      effectiveFrom,
      DEFAULT_ORIGIN_TYPE,
      DEFAULT_ORIGIN_REF,
      DEFAULT_REASON_CODE,
      DEFAULT_UPDATED_BY,
    ]
  );
}

function printSummary(summary) {
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error('Use --file "caminho-do-arquivo.xls"');
  }

  const env = {
    ...loadEnvFile(path.resolve('.env.local')),
    ...process.env,
  };

  const connectionString = buildConnectionString(env);
  const tenantId = env.MS_TENANT_ID || 'tenant_default';
  const rows = parseWorkbook(args.file);
  if (rows.length === 0) {
    throw new Error('Nenhum item válido encontrado para importação.');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);

    const taxonomyMap = await loadTaxonomyMap(
      client,
      rows.map((row) => row.taxonomyGroup)
    );

    const existingState = await loadExistingState(
      client,
      tenantId,
      rows.map((row) => row.sku),
      rows.map((row) => row.pnInterno),
      rows.map((row) => row.reference).filter(Boolean),
      rows.map((row) => row.ean).filter(Boolean)
    );

    const effectiveFrom = new Date();
    const summary = {
      mode: args.apply ? 'apply' : 'dry-run',
      file: path.resolve(args.file),
      tenantId,
      totals: {
        rows: rows.length,
        productsInsert: 0,
        productsUpdate: 0,
        identifiersInsert: 0,
        identifiersUpdate: 0,
        pricesInsert: 0,
        pricesUpdate: 0,
        inventoryInsert: 0,
        inventoryUpdate: 0,
      },
      items: [],
    };

    for (const row of rows) {
      const existedProduct = existingState.productBySku.get(row.sku);
      const productId = existedProduct || makeId('prd');
      const taxonomyNodeId = row.taxonomyGroup ? taxonomyMap.get(row.taxonomyGroup) : null;
      const rowEventId = crypto.randomBytes(12).toString('hex');
      const priceId = `price_${rowEventId}`;
      const positionId = `pos_${rowEventId}`;

      summary.totals[existedProduct ? 'productsUpdate' : 'productsInsert'] += 1;

      const identifiers = [
        { type: 'pn_interno', value: row.pnInterno, isPrimary: true },
        row.reference ? { type: 'reference', value: row.reference, isPrimary: false } : null,
        row.ean ? { type: 'ean', value: row.ean, isPrimary: false } : null,
      ].filter(Boolean);

      for (const identifier of identifiers) {
        const key = `${identifier.type}:${identifier.value}`;
        summary.totals[existingState.identifierKeys.has(key) ? 'identifiersUpdate' : 'identifiersInsert'] += 1;
      }

      summary.totals[existingState.priceKeys.has(productId) ? 'pricesUpdate' : 'pricesInsert'] += 1;
      summary.totals[existingState.inventoryKeys.has(productId) ? 'inventoryUpdate' : 'inventoryInsert'] += 1;

      summary.items.push({
        sku: row.sku,
        name: row.name,
        taxonomyGroup: row.taxonomyGroup,
        taxonomyNodeId,
        stockProfileCode: row.stockProfileCode,
        identifiers: identifiers.map((identifier) => ({
          type: identifier.type,
          value: identifier.value,
        })),
        priceAmount: row.priceAmount,
        replacementCostAmount: row.replacementCostAmount,
        averageCostAmount: row.averageCostAmount,
        onHandQuantity: row.onHandQuantity,
      });

      if (!args.apply) {
        continue;
      }

      const persistedProductId = await upsertProduct(
        client,
        tenantId,
        row,
        taxonomyNodeId,
        productId
      );

      for (const identifier of identifiers) {
        await upsertIdentifier(
          client,
          tenantId,
          persistedProductId,
          identifier.type,
          identifier.value,
          identifier.isPrimary
        );
      }

      await upsertPrice(client, tenantId, persistedProductId, row, priceId, effectiveFrom);
      await upsertInventory(client, tenantId, persistedProductId, row, positionId, effectiveFrom);
    }

    if (args.apply) {
      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
    }

    printSummary(summary);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
