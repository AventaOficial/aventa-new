/** Estado inicial del campo paste al cambiar de oferta (o al montar). */
export function initialAffiliatePasteUi(linkModOk: boolean | null | undefined) {
  return {
    affiliatePaste: '',
    pasteStatus: linkModOk === true ? ('valid' as const) : ('idle' as const),
    pasteValidation: null,
    pasteError: null,
  };
}
