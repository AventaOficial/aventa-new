export type GalleryView = {
  index: number;
  open: boolean;
};

/** Elegir una miniatura cambia la foto principal y no abre el visor. */
export function selectGalleryImage(index: number): GalleryView {
  return { index, open: false };
}

/** Solo el control explícito de ampliar abre el visor, sobre la imagen ya elegida. */
export function expandGallery(view: GalleryView): GalleryView {
  return { index: view.index, open: true };
}

export function closeGallery(view: GalleryView): GalleryView {
  return { index: view.index, open: false };
}
