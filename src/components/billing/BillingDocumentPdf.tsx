import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer'
import {
  DocumentPresentation,
  formatDate,
  formatMoney,
  formatQuantity,
} from '@/lib/billing/document-presentation'

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingHorizontal: 44,
    paddingBottom: 64,
    fontSize: 10.5,
    fontFamily: 'Helvetica',
    color: '#334155',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  businessInfo: {
    flex: 1,
  },
  logo: {
    width: 110,
    height: 55,
    objectFit: 'contain',
    marginBottom: 8,
  },
  businessName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 3,
  },
  businessDetail: {
    fontSize: 9,
    color: '#64748b',
    marginBottom: 1.5,
    lineHeight: 1.3,
  },
  docType: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'right',
    letterSpacing: 0.5,
  },
  docNumber: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
    textAlign: 'right',
    marginTop: 5,
  },
  statusBadge: {
    fontSize: 8.5,
    textAlign: 'center',
    marginTop: 8,
    padding: '3 10',
    borderRadius: 10,
    alignSelf: 'flex-end',
  },
  customerDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  sectionLabel: {
    fontSize: 7.5,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.6,
  },
  customerName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 2,
  },
  customerDetail: {
    fontSize: 9.5,
    color: '#64748b',
    marginBottom: 1.5,
    lineHeight: 1.3,
  },
  dateValue: {
    fontSize: 9.5,
    color: '#334155',
    lineHeight: 1.3,
  },
  table: {
    marginBottom: 22,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 7,
    marginBottom: 2,
  },
  th: {
    fontWeight: 'bold',
    color: '#475569',
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  thDesc: { flex: 3, textAlign: 'left' },
  thQty: { width: 50, textAlign: 'right' },
  thUnit: { width: 50, textAlign: 'left' },
  thRate: { width: 70, textAlign: 'right' },
  thAmount: { width: 80, textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 6,
  },
  tdDesc: { flex: 3, textAlign: 'left', color: '#334155', fontSize: 10 },
  tdQty: { width: 50, textAlign: 'right', color: '#334155', fontSize: 10 },
  tdUnit: { width: 50, textAlign: 'left', color: '#64748b', fontSize: 9.5 },
  tdRate: { width: 70, textAlign: 'right', color: '#334155', fontSize: 10 },
  tdAmount: { width: 80, textAlign: 'right', color: '#0f172a', fontSize: 10, fontWeight: 'bold' },
  totals: {
    alignSelf: 'flex-end',
    width: 210,
    marginBottom: 22,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalLabel: { color: '#64748b', fontSize: 9.5 },
  totalValue: { color: '#0f172a', fontSize: 9.5, fontWeight: 'bold' },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 2,
    borderTopColor: '#334155',
    paddingTop: 9,
    marginTop: 7,
  },
  grandTotalLabel: { fontSize: 13, fontWeight: 'bold', color: '#0f172a' },
  grandTotalValue: { fontSize: 15, fontWeight: 'bold' },
  notesSection: {
    marginBottom: 14,
  },
  notesContent: {
    fontSize: 9.5,
    color: '#64748b',
    lineHeight: 1.45,
  },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 44,
    right: 44,
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    fontSize: 7.5,
    color: '#cbd5e1',
    letterSpacing: 0.3,
  },
})

const QUOTE_COLOR = '#1d4ed8'
const INVOICE_COLOR = '#059669'

export function BillingDocumentPdf({ doc }: { doc: DocumentPresentation }) {
  const isQuote = doc.document_type === 'quote'
  const accent = isQuote ? QUOTE_COLOR : INVOICE_COLOR

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Business header */}
        <View style={styles.header}>
          <View style={styles.businessInfo}>
            {doc.business_logo_url ? (
              <Image style={styles.logo} src={doc.business_logo_url} />
            ) : null}
            <Text style={styles.businessName}>{doc.business_name}</Text>
            {doc.business_phone ? <Text style={styles.businessDetail}>{doc.business_phone}</Text> : null}
            {doc.business_email ? <Text style={styles.businessDetail}>{doc.business_email}</Text> : null}
            {doc.business_address ? <Text style={styles.businessDetail}>{doc.business_address}</Text> : null}
          </View>
          <View>
            <Text style={[styles.docType, { color: accent }]}>
              {isQuote ? 'QUOTE' : 'INVOICE'}
            </Text>
            <Text style={styles.docNumber}>{doc.document_number}</Text>
          </View>
        </View>

        {/* Customer + dates */}
        <View style={styles.customerDates}>
          <View>
            <Text style={styles.sectionLabel}>{isQuote ? 'Quote To' : 'Bill To'}</Text>
            <Text style={styles.customerName}>{doc.customer_name || 'No customer specified'}</Text>
            {doc.customer_phone ? <Text style={styles.customerDetail}>{doc.customer_phone}</Text> : null}
            {doc.customer_email ? <Text style={styles.customerDetail}>{doc.customer_email}</Text> : null}
            {doc.customer_address ? <Text style={styles.customerDetail}>{doc.customer_address}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.sectionLabel}>Issue Date</Text>
            <Text style={styles.dateValue}>{formatDate(doc.issue_date)}</Text>
            {isQuote && doc.valid_until ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 6 }]}>Valid Until</Text>
                <Text style={styles.dateValue}>{formatDate(doc.valid_until)}</Text>
              </>
            ) : null}
            {!isQuote && doc.due_date ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 6 }]}>Due Date</Text>
                <Text style={styles.dateValue}>{formatDate(doc.due_date)}</Text>
              </>
            ) : null}
          </View>
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.thDesc]}>Description</Text>
            <Text style={[styles.th, styles.thQty]}>Qty</Text>
            <Text style={[styles.th, styles.thUnit]}>Unit</Text>
            <Text style={[styles.th, styles.thRate]}>Rate</Text>
            <Text style={[styles.th, styles.thAmount]}>Amount</Text>
          </View>
          {doc.line_items.map((item, i) => {
            const isFlatRate = item.quantity === 1 && !item.unit_label
            return (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tdDesc]}>{item.description || ''}</Text>
              <Text style={[styles.tdQty]}>{isFlatRate ? '\u2014' : formatQuantity(item.quantity)}</Text>
              <Text style={[styles.tdUnit]}>{item.unit_label || ''}</Text>
              <Text style={[styles.tdRate]}>{formatMoney(item.unit_price_cents)}</Text>
              <Text style={[styles.tdAmount]}>{formatMoney(item.line_total_cents)}</Text>
            </View>
            )
          })}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatMoney(doc.subtotal_cents)}</Text>
          </View>
          {doc.discount_cents > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={[styles.totalValue, { color: '#dc2626' }]}>-{formatMoney(doc.discount_cents)}</Text>
            </View>
          ) : null}
          {doc.tax_cents > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax</Text>
              <Text style={styles.totalValue}>{formatMoney(doc.tax_cents)}</Text>
            </View>
          ) : null}
          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={[styles.grandTotalValue, { color: accent }]}>{formatMoney(doc.total_cents)}</Text>
          </View>
        </View>

        {/* Notes */}
        {doc.notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notesContent}>{doc.notes}</Text>
          </View>
        ) : null}

        {/* Terms */}
        {doc.terms ? (
          <View style={styles.notesSection}>
            <Text style={styles.sectionLabel}>Terms</Text>
            <Text style={styles.notesContent}>{doc.terms}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer}>
          <Text>Powered by ReplyFlow</Text>
        </View>
      </Page>
    </Document>
  )
}
