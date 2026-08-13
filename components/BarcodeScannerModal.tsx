import { useState, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, ScrollView, FlatList,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { lookupBarcode, searchFoodByName, offProductToFoodItem, OFFProduct } from '../services/foodAI';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (params: {
    name: string; calories: number; protein: number; carbs: number; fat: number; fiber?: number;
  }) => void;
}

type ViewMode = 'scan' | 'search' | 'product';

export default function BarcodeScannerModal({ visible, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  // Усередині Modal insets можуть повернути 0 (окрема ієрархія в'ю), тому
  // беремо більше з двох: колишнє жорстке 56 — нижня межа, яка вже працювала.
  const headerPadTop = Math.max(insets.top + 8, 56);
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<ViewMode>('scan');
  const [scanning, setScanning] = useState(true);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<OFFProduct | null>(null);
  const [gramsInput, setGramsInput] = useState('100');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OFFProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const scannedRef = useRef(false);

  function handleClose() {
    scannedRef.current = false;
    setScanning(true);
    setMode('scan');
    setProduct(null);
    setGramsInput('100');
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  }

  async function handleBarcode({ data }: { data: string }) {
    if (scannedRef.current || !scanning) return;
    scannedRef.current = true;
    setScanning(false);
    setLoading(true);
    try {
      const p = await lookupBarcode(data);
      if (!p) {
        // Not found — switch to name search fallback
        setMode('search');
      } else {
        setProduct(p);
        if (p.servingSize) setGramsInput(String(p.servingSize));
        setMode('product');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const results = await searchFoodByName(q);
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }

  function selectSearchResult(p: OFFProduct) {
    setProduct(p);
    if (p.servingSize) setGramsInput(String(p.servingSize));
    else setGramsInput('100');
    setMode('product');
  }

  function handleConfirm() {
    if (!product) return;
    const grams = parseFloat(gramsInput) || 100;
    const item = offProductToFoodItem(product, grams);
    onConfirm({
      name: item.name,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber,
    });
    handleClose();
  }

  function rescan() {
    scannedRef.current = false;
    setProduct(null);
    setGramsInput('100');
    setSearchQuery('');
    setSearchResults([]);
    setMode('scan');
    setScanning(true);
  }

  function getHeaderTitle() {
    if (mode === 'product') return 'Продукт знайдено';
    if (mode === 'search') return 'Пошук продукту';
    return 'Скануй штрих-код';
  }

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.dimOverlay}><ActivityIndicator color={Colors.primary} /></View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.dimOverlay}>
          <View style={styles.permCard}>
            <Ionicons name="camera-outline" size={48} color={Colors.primary} />
            <Text style={styles.permTitle}>Потрібен доступ до камери</Text>
            <Text style={styles.permText}>Для сканування штрих-кодів AlphaTrainer потребує доступ до камери.</Text>
            <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
              <Text style={styles.permBtnText}>Надати доступ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>Скасувати</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: headerPadTop }]}>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
          {mode === 'scan' ? (
            <TouchableOpacity style={styles.headerBtn} onPress={() => { setMode('search'); setScanning(false); }}>
              <Ionicons name="search-outline" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        {/* SCAN mode */}
        {mode === 'scan' && (
          <>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean8', 'ean13', 'upc_a', 'upc_e', 'qr'] }}
              onBarcodeScanned={scanning ? handleBarcode : undefined}
            />
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Text style={styles.scanHint}>Наведи камеру на штрих-код</Text>
            </View>
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Пошук продукту...</Text>
              </View>
            )}
          </>
        )}

        {/* SEARCH mode */}
        {mode === 'search' && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.searchContainer}>
              {/* Info banner */}
              <View style={styles.infoBanner}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.infoBannerText}>
                  Продукт не знайдено за штрих-кодом. Спробуй пошук за назвою.
                </Text>
              </View>

              {/* Search row */}
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Назва продукту..."
                  placeholderTextColor={Colors.textMuted}
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.searchBtn, searching && { opacity: 0.6 }]}
                  onPress={handleSearch}
                  disabled={searching}
                >
                  {searching
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Ionicons name="search" size={20} color="#FFF" />
                  }
                </TouchableOpacity>
              </View>

              {/* Results */}
              {searchResults.length === 0 && !searching && searchQuery.trim().length > 0 && (
                <View style={styles.emptyResults}>
                  <Ionicons name="sad-outline" size={32} color={Colors.textMuted} />
                  <Text style={styles.emptyResultsText}>Нічого не знайдено</Text>
                  <Text style={styles.emptyResultsHint}>Спробуй іншу назву або мову (англійська пошукується краще)</Text>
                </View>
              )}

              <FlatList
                data={searchResults}
                keyExtractor={(item, i) => `${item.name}_${i}`}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.resultItem} onPress={() => selectSearchResult(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName} numberOfLines={2}>{item.name}</Text>
                      {item.brand && <Text style={styles.resultBrand}>{item.brand}</Text>}
                    </View>
                    <View style={styles.resultMacros}>
                      <Text style={styles.resultCal}>{item.calories} ккал</Text>
                      <Text style={styles.resultMacroDetail}>Б{item.protein}·В{item.carbs}·Ж{item.fat}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            </View>

            {/* Bottom: scan again */}
            <TouchableOpacity style={styles.backToScanBtn} onPress={rescan}>
              <Ionicons name="scan-outline" size={18} color={Colors.primary} />
              <Text style={styles.backToScanText}>Сканувати ще раз</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        )}

        {/* PRODUCT mode */}
        {mode === 'product' && product && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              style={styles.resultContainer}
              contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.xl }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.productCard}>
                <Text style={styles.productName}>{product.name}</Text>
                {product.brand && <Text style={styles.productBrand}>{product.brand}</Text>}
                <Text style={styles.productPer}>Поживність на 100г:</Text>
                <View style={styles.macroRow}>
                  <MacroChip label="ккал" value={product.calories} color={Colors.accent} />
                  <MacroChip label="Білки" value={product.protein} color="#E63946" />
                  <MacroChip label="Вуглев." value={product.carbs} color="#F4A261" />
                  <MacroChip label="Жири" value={product.fat} color="#2ECC71" />
                </View>
              </View>

              <View style={styles.gramsRow}>
                <Text style={styles.gramsLabel}>Кількість (г):</Text>
                <TextInput
                  style={styles.gramsInput}
                  value={gramsInput}
                  onChangeText={setGramsInput}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
              </View>

              {(() => {
                const g = parseFloat(gramsInput) || 100;
                const f = g / 100;
                return (
                  <View style={styles.calcRow}>
                    <Text style={styles.calcLabel}>На {g}г:</Text>
                    <Text style={styles.calcValue}>
                      {Math.round(product.calories * f)} ккал · Б{Math.round(product.protein * f * 10) / 10}г · В{Math.round(product.carbs * f * 10) / 10}г · Ж{Math.round(product.fat * f * 10) / 10}г
                    </Text>
                  </View>
                );
              })()}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.rescanBtn} onPress={rescan}>
                  <Ionicons name="scan-outline" size={18} color={Colors.textSecondary} />
                  <Text style={styles.rescanBtnText}>Сканувати ще</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                  <Text style={styles.confirmBtnText}>Додати до прийому</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.macroChip, { borderColor: color + '40', backgroundColor: color + '15' }]}>
      <Text style={[styles.macroChipValue, { color }]}>{value}</Text>
      <Text style={styles.macroChipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    // paddingTop — через headerPadTop у місці використання
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.h3 },
  camera: { flex: 1 },
  dimOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.lg,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', gap: Spacing.lg,
  },
  scanFrame: { width: 260, height: 160, position: 'relative' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#FFF', borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  scanHint: { color: '#FFF', fontSize: 14, textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  loadingText: { color: '#FFF', fontSize: 16 },
  // Search mode
  searchContainer: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  infoBannerText: { color: Colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 },
  searchRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  searchInput: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 15, paddingHorizontal: Spacing.md, paddingVertical: 11,
  },
  searchBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, alignItems: 'center', justifyContent: 'center', minWidth: 48,
  },
  emptyResults: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptyResultsText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '600' },
  emptyResultsHint: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  resultItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  resultName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  resultBrand: { color: Colors.textMuted, fontSize: 12 },
  resultMacros: { alignItems: 'flex-end', marginLeft: Spacing.sm },
  resultCal: { color: Colors.accent, fontSize: 14, fontWeight: '700' },
  resultMacroDetail: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: Spacing.xs },
  backToScanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  backToScanText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
  // Product/result view
  resultContainer: { flex: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
  productCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md,
  },
  productName: { ...Typography.h3, marginBottom: 4 },
  productBrand: { color: Colors.textMuted, fontSize: 13, marginBottom: Spacing.sm },
  productPer: { color: Colors.textSecondary, fontSize: 12, marginBottom: Spacing.sm },
  macroRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  macroChip: {
    borderRadius: BorderRadius.md, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6,
    alignItems: 'center', minWidth: 60,
  },
  macroChipValue: { fontSize: 16, fontWeight: '700' },
  macroChipLabel: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  gramsRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  gramsLabel: { color: Colors.textSecondary, fontSize: 15, flex: 1 },
  gramsInput: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary,
    fontSize: 16, paddingHorizontal: 12, paddingVertical: 8, width: 90, textAlign: 'center',
  },
  calcRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.sm, marginBottom: Spacing.lg,
  },
  calcLabel: { color: Colors.textMuted, fontSize: 13 },
  calcValue: { color: Colors.textSecondary, fontSize: 13, flex: 1 },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  rescanBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, paddingVertical: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  rescanBtnText: { color: Colors.textSecondary, fontWeight: '600' },
  confirmBtn: {
    flex: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: 14,
  },
  confirmBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  // Permission screen
  permCard: {
    backgroundColor: Colors.surface, borderRadius: BorderRadius.xl,
    margin: Spacing.lg, padding: Spacing.xl, alignItems: 'center', gap: Spacing.md,
  },
  permTitle: { ...Typography.h3 },
  permText: { color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  permBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: 12, paddingHorizontal: Spacing.xl,
  },
  permBtnText: { color: '#FFF', fontWeight: '700' },
  closeBtn: { paddingVertical: 8 },
  closeBtnText: { color: Colors.textMuted },
});
