/** Producto normalizado extraído de una página de tienda. */
export interface ExtractedProduct {
  store: string;
  offerUrl: string;
  title: string | null;
  price: number | null;
  originalPrice: number | null;
  imageUrl: string | null;
  productId: string | null;
  /** true si faltan campos importantes (título, precio o imagen). */
  partial: boolean;
}

export type StoreAdapter = {
  canHandle: (url: string) => boolean;
  getStoreName: () => string;
  extractProduct: (doc: Document, pageUrl: string) => ExtractedProduct;
};
