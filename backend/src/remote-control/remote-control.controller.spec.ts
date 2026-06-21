import { type AuthenticatedRequest } from '../auth/auth-request';
import { RemoteControlController } from './remote-control.controller';

type MockRemoteControlService = {
  ackCommand: jest.Mock<unknown, [string, string, string, unknown]>;
  createCommand: jest.Mock<unknown, [string, string, unknown]>;
  listDevices: jest.Mock<unknown, [string]>;
  pollCommands: jest.Mock<unknown, [string, string, unknown]>;
  registerDevice: jest.Mock<unknown, [string, unknown]>;
};

describe('RemoteControlController', () => {
  let controller: RemoteControlController;
  let service: MockRemoteControlService;
  const request = {
    auth: {
      sessionId: 'session-1',
      userId: 'user-1',
    },
  } as AuthenticatedRequest;

  beforeEach(() => {
    const createMock = <TReturn, TArgs extends unknown[]>() =>
      jest.fn<TReturn, TArgs>();

    service = {
      ackCommand: createMock<unknown, [string, string, string, unknown]>(),
      createCommand: createMock<unknown, [string, string, unknown]>(),
      listDevices: createMock<unknown, [string]>(),
      pollCommands: createMock<unknown, [string, string, unknown]>(),
      registerDevice: createMock<unknown, [string, unknown]>(),
    };
    controller = new RemoteControlController(service as never);
  });

  it('passes authenticated user id to device registration', () => {
    const body = { clientDeviceId: 'client-1' };

    void controller.registerDevice(request, body);

    expect(service.registerDevice).toHaveBeenCalledWith('user-1', body);
  });

  it('passes authenticated user id to device listing', () => {
    void controller.listDevices(request);

    expect(service.listDevices).toHaveBeenCalledWith('user-1');
  });

  it('passes route params to command creation', () => {
    const body = { type: 'STOP' };

    void controller.createCommand(request, 'device-1', body);

    expect(service.createCommand).toHaveBeenCalledWith(
      'user-1',
      'device-1',
      body,
    );
  });

  it('passes route params to polling and ack', () => {
    const pollBody = { clientDeviceId: 'client-1' };
    const ackBody = { clientDeviceId: 'client-1', status: 'APPLIED' };

    void controller.pollCommands(request, 'device-1', pollBody);
    void controller.ackCommand(request, 'device-1', 'command-1', ackBody);

    expect(service.pollCommands).toHaveBeenCalledWith(
      'user-1',
      'device-1',
      pollBody,
    );
    expect(service.ackCommand).toHaveBeenCalledWith(
      'user-1',
      'device-1',
      'command-1',
      ackBody,
    );
  });
});
