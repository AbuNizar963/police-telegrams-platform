declare module "xlsx-populate" {
  type OutputOptions = { password?: string };
  type Sheet = { cell(address: string): { value(value?: unknown): unknown } };
  type Workbook = {
    sheet(name: string): Sheet;
    outputAsync(
      options?: OutputOptions
    ): Promise<ArrayBuffer | Uint8Array | Buffer>;
  };
  const XlsxPopulate: {
    fromDataAsync(data: Buffer): Promise<Workbook>;
  };
  export default XlsxPopulate;
}
