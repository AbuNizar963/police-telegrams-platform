declare module "xlsx-populate" {
  type OutputOptions = { password?: string };
  type Sheet = {
    name(): string;
    cell(address: string): { value(value?: unknown): unknown };
    usedRange(): { value(): unknown[][] };
  };
  type Workbook = {
    sheet(name: string): Sheet;
    sheets(): Sheet[];
    outputAsync(
      options?: OutputOptions
    ): Promise<ArrayBuffer | Uint8Array | Buffer>;
  };
  const XlsxPopulate: {
    fromDataAsync(data: Buffer, options?: OutputOptions): Promise<Workbook>;
  };
  export default XlsxPopulate;
}
