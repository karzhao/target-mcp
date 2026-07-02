export interface StoreSummary {
    store_id: string;
    name: string;
    address: string;
    phone: string;
    url: string;
}
export interface ProductInfo {
    tcin: string;
    title: string;
    price: number | null;
    image_url: string;
    buy_url: string;
}
export interface StoreAvailability {
    store_id: string;
    store_name: string;
    store_address: string;
    pickup_available: boolean;
    in_store_available: boolean;
    pickup_date: string | null;
}
export interface SearchResult {
    tcin: string;
    title: string;
    price: number | null;
    formatted_price: string;
    image_url: string;
    buy_url: string;
    brand: string;
    rating: number | null;
    review_count: number | null;
    in_stock: boolean;
    available_stores: StoreAvailability[];
}
export declare function findStoresByZip(zip: string): Promise<StoreSummary[]>;
export declare function lookupProduct(tcin: string): Promise<ProductInfo>;
export declare function searchProducts(query: string, limit: number | undefined, store_id: string, zip: string): Promise<SearchResult[]>;
