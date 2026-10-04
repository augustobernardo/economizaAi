describe('/dev/* sem NODE_ENV', () => {
  const envOriginal = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = envOriginal;
  });

  // Testa o GastosModule isolado: com NODE_ENV ausente o AppModule nem sobe
  // (o env schema valida NODE_ENV), então o gate é verificado na fonte.
  it('falha fechado: não registra DevController', async () => {
    delete process.env.NODE_ENV;
    // import dinâmico: o GastosModule decide os controllers na importação.
    const { GastosModule } =
      await import('../src/modules/gastos/gastos.module.js');
    expect(Reflect.getMetadata('controllers', GastosModule)).toEqual([]);
  });
});
