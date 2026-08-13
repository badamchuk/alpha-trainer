// AsyncStorage — нативний модуль, у тестах його підміняє офіційний мок
// з самого пакета (зберігає дані в памʼяті).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
