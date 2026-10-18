declare module "xlsx-populate" {
  type Cell = { value(value?: unknown): unknown };
  type Sheet = {
    name(): string;
    usedRange(): { value(): unknown[][] };
    cell(reference: string): Cell;
    range(reference: string): { value(): unknown[][] };
  };
  type Workbook = {
    sheets(): Sheet[];
    sheet(name: string): Sheet;
    outputAsync(options?: { password?: string }): Promise<ArrayBuffer>;
  };
  const XlsxPopulate: {
    fromDataAsync(
      data: ArrayBuffer | Uint8Array,
      options?: { password?: string }
    ): Promise<Workbook>;
    fromBlankAsync(): Promise<Workbook>;
  };
  export default XlsxPopulate;
}
