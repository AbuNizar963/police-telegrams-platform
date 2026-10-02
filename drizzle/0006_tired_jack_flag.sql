ALTER TABLE `telegrams`
  ADD `idempotencyKey` varchar(64);

ALTER TABLE `telegrams`
  ADD CONSTRAINT `telegrams_idempotencyKey_unique`
  UNIQUE (`idempotencyKey`);
