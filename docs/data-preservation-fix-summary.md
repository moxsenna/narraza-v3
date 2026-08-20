# Data-Preservation Fix Summary for Foundation Form

## Critical Issue Identified
Internal IDs were being exposed via visible TextInput components or losing persisted values through synthetic fallback patterns (`|| 'main'`, `|| 'other'`, `|| 'chapter-10'`), which could corrupt backend data integrity on subsequent edits.

## Solution Implemented

### 1. Internal ID Hiding Pattern
**Files Modified:**
- `apps/web/src/app/app/proyek/[projectId]/fondasi/foundation-forms.tsx`

**Transformation Applied:**
```tsx
// Before (VISIBLE - BAD):
<TextInput
  name="mainCharacterId"
  label="ID tokoh utama (internal)"
  defaultValue={props.mainCharacterId || 'main'}
  disabled={!canEditDraft}
/>

// After (HIDDEN - GOOD):
{props.mainCharacterId ? (
  <input type="hidden" name="mainCharacterId" value={props.mainCharacterId} />
) : null}
```

**Fields Hidden:**
- `mainCharacterId` - Primary character reference
- `relationshipOtherId` - Secondary character reference  
- `secretTargetChapterId` - Target chapter for reveal schedule
- `secretTargetSequence` - Sequence number for target
- `secretBreadcrumb1ChapterId` - First trigger chapter
- `secretBreadcrumb1Sequence` - First trigger sequence
- `secretBreadcrumb2ChapterId` - Second trigger chapter
- `secretBreadcrumb2Sequence` - Second trigger sequence

### 2. Fail-Closed Relationship Editing
When `relationshipOtherId` doesn't exist, the relationshipDescription field becomes disabled with explanatory messaging preventing creation of phantom relationships.

**Implementation:**
```tsx
<Field
  name="relationshipDescription"
  label="Jenis hubungan / keterangan"
  defaultValue={props.relationshipDescription}
  disabled={!canEditDraft || !props.relationshipOtherId}
/>
```

### 3. Conditional Secret Schedule Rendering
All secret schedule inputs are wrapped in conditional blocks showing them only when real chapter references exist:

```tsx
{props.secretTargetChapterId && props.secretTargetSequence ? (
  <>
    <input type="hidden" name="secretTargetChapterId" value={props.secretTargetChapterId} />
    <input type="hidden" name="secretTargetSequence" value={props.secretTargetSequence || ''} />
  </>
) : null}
```

**Added UX Feedback:**
```tsx
{(!props.secretTargetChapterId || !props.secretBreadcrumb1ChapterId) && (
  <p className="mt-2 text-xs text-ink-500 italic">
    Jadwal pengungkapan memerlukan bab referensi. Tidak dapat disetel saat ini.
  </p>
)}
```

### 4. Synthetic Fallback Removal
**File:** `apps/web/src/app/app/proyek/[projectId]/fondasi/page.tsx`

**Pattern Eliminated:**
- ❌ `str(main.id) || 'main'` → ✅ `str(main.id)`
- ❌ `otherId || 'other'` → ✅ `otherId`
- ❌ `str(target.chapterId) || 'chapter-10'` → ✅ `str(target.chapterId)`
- ❌ `numStr(target.sequence, '10')` → ✅ `numStr(target.sequence)`
- Same pattern applied to both breadcrumb fields

## Git Reference

**Branch:** `feat/pr2-final-fixes`  
**Commit SHA:** `3fc7976949ee0a8af094c8b008fdca08b8130cec`  
**Commit Message:** "fix: data-preservation in Foundation form with hidden internal IDs and fail-closed behavior"

## Validation Checklist

- [x] All internal IDs converted to hidden inputs with conditional rendering
- [x] Synthetic fallback patterns removed from page component
- [x] Fail-closed logic applied to relationshipDescription field
- [x] Secret schedule inputs conditionally rendered based on reference existence
- [x] TypeScript compilation passes without errors
- [x] No visual regression on core editable fields
- [ ] Browser QA at 1440px viewport completed
- [ ] CI pipeline fresh run (8/8 green) required

## Next Steps

1. Update PR #13 to point to new commit after full scope verification
2. Perform explicit 1440px browser QA (not inherited from prior assumptions)
3. Run full local gates suite including architecture boundaries check
4. Achieve fresh 8/8 CI on corrected history
5. Final mergeability verification (merge-base = master, zero contamination)
6. Obtain maintainer approval before marking Ready for merge
