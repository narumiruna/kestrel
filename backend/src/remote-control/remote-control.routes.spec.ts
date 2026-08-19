import { createStubSessionAuth, jsonRequest } from '../test-support/route-test';
import type { RemoteControlService } from './remote-control.service';
import { createRemoteControlRoutes } from './remote-control.routes';

type MockRemoteControlService = {
  ackCommand: jest.Mock<unknown, [string, string, string, unknown]>;
  createCommand: jest.Mock<unknown, [string, string, unknown]>;
  listDevices: jest.Mock<unknown, [string]>;
  pollCommands: jest.Mock<unknown, [string, string, unknown]>;
  registerDevice: jest.Mock<unknown, [string, string, unknown]>;
  reportDeviceState: jest.Mock<unknown, [string, string, unknown]>;
};

describe('remote control routes', () => {
  let service: MockRemoteControlService;
  let routes: ReturnType<typeof createRemoteControlRoutes>;

  beforeEach(() => {
    const createMock = <TReturn, TArgs extends unknown[]>() =>
      jest.fn<TReturn, TArgs>().mockReturnValue({} as TReturn);

    service = {
      ackCommand: createMock<unknown, [string, string, string, unknown]>(),
      createCommand: createMock<unknown, [string, string, unknown]>(),
      listDevices: createMock<unknown, [string]>(),
      pollCommands: createMock<unknown, [string, string, unknown]>(),
      registerDevice: createMock<unknown, [string, string, unknown]>(),
      reportDeviceState: createMock<unknown, [string, string, unknown]>(),
    };
    routes = createRemoteControlRoutes(
      service as unknown as RemoteControlService,
      createStubSessionAuth(),
    );
  });

  it('passes authenticated user and session id to device registration', async () => {
    const body = { clientDeviceId: 'client-1' };

    const response = await routes.request(
      '/devices/register',
      jsonRequest(body),
    );

    expect(response.status).toBe(201);
    expect(service.registerDevice).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      body,
    );
  });

  it('passes authenticated user id to device listing', async () => {
    await routes.request('/devices');

    expect(service.listDevices).toHaveBeenCalledWith('user-1');
  });

  it('passes route params to command creation', async () => {
    const body = { type: 'STOP' };

    await routes.request('/devices/device-1/commands', jsonRequest(body));

    expect(service.createCommand).toHaveBeenCalledWith(
      'user-1',
      'device-1',
      body,
    );
  });

  it('passes route params to device state reports', async () => {
    const body = { clientDeviceId: 'client-1', playbackState: 'ROUTE' };

    await routes.request('/devices/device-1/state', jsonRequest(body));

    expect(service.reportDeviceState).toHaveBeenCalledWith(
      'user-1',
      'device-1',
      body,
    );
  });

  it('passes route params to polling and ack', async () => {
    const pollBody = { clientDeviceId: 'client-1' };
    const ackBody = { clientDeviceId: 'client-1', status: 'APPLIED' };

    await routes.request(
      '/devices/device-1/commands/poll',
      jsonRequest(pollBody),
    );
    await routes.request(
      '/devices/device-1/commands/command-1/ack',
      jsonRequest(ackBody),
    );

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
