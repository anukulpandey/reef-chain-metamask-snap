import { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';

import { WsProvider } from '@polkadot/api';
import { Provider, Signer as ReefVMSigner } from '@reef-chain/evm-provider';

import Signer from './Signer';
import {
  ConnectButton,
  InstallFlaskButton,
  ReconnectButton,
  Card,
  Button,
  TextArea,
  Toggle,
} from '../components';
import { defaultSnapOrigin } from '../config';
import { MetamaskActions, MetaMaskContext } from '../hooks';
import {
  connectSnap,
  getSnap,
  isLocalSnap,
  sendCreateAccountWithSeed,
  sendCreateSeed,
  sendForgetAccount,
  sendGetNetwork,
  sendImportAccountsFromJson,
  sendListAccounts,
  sendSetNetwork,
  sendToSnap,
  shouldDisplayReconnectButton,
} from '../utils';
import { flipIt, getFlipperValue } from './flipperContract';
import { getMetadata } from '../utils/metadata';
import { Account, Network } from './types';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  margin-top: 7.6rem;
  margin-bottom: 7.6rem;
  ${({ theme }) => theme.mediaQueries.small} {
    padding-left: 2.4rem;
    padding-right: 2.4rem;
    margin-top: 2rem;
    margin-bottom: 2rem;
    width: auto;
  }
`;

const Heading = styled.h1`
  margin-top: 0;
  margin-bottom: 2.4rem;
  text-align: center;
`;

const Span = styled.span`
  color: ${(props) => props.theme.colors.primary?.default};
`;

const Subtitle = styled.div`
  display: flex;
  align-items: center;
  font-size: ${({ theme }) => theme.fontSizes.large};
  font-weight: 500;
  margin-top: 0;
  margin-bottom: 0;
  ${({ theme }) => theme.mediaQueries.small} {
    font-size: ${({ theme }) => theme.fontSizes.text};
  }
`;

const CardContainer = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  max-width: 64.8rem;
  width: 100%;
  height: 100%;
  margin-top: 1.5rem;
`;

const ErrorMessage = styled.div`
  background-color: ${({ theme }) => theme.colors.error?.muted};
  border: 1px solid ${({ theme }) => theme.colors.error?.default};
  color: ${({ theme }) => theme.colors.error?.alternative};
  border-radius: ${({ theme }) => theme.radii.default};
  padding: 2.4rem;
  margin-bottom: 2.4rem;
  margin-top: 2.4rem;
  max-width: 60rem;
  width: 100%;
  ${({ theme }) => theme.mediaQueries.small} {
    padding: 1.6rem;
    margin-bottom: 1.2rem;
    margin-top: 1.2rem;
    max-width: 100%;
  }
`;

const SelectInput = styled.select`
  padding: 0.5rem;
  font-size: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const Option = styled.option`
  padding: 0.5rem;
`;

const Index = () => {
  const [state, dispatch] = useContext(MetaMaskContext);
  const [seed, setSeed] = useState<string>();
  const [addressDelete, setAddressDelete] = useState<string>();
  const [reefVmSigner, setReefVmSigner] = useState<ReefVMSigner>();
  const [provider, setProvider] = useState<Provider>();
  const [network, setNetwork] = useState<Network>();
  const [accounts, setAccounts] = useState<Account[]>([]);

  const isMetaMaskReady = isLocalSnap(defaultSnapOrigin)
    ? state.isFlask
    : state.snapsDetected;

  useEffect(() => {
    if (state.installedSnap) {
      getNetwork();
      getAccounts();
    }
  }, [state.installedSnap]);

  useEffect(() => {
    console.log('network changed:', network);
    updateProvider(network);
  }, [network]);

  const connect = async () => {
    try {
      await connectSnap();
      const installedSnap = await getSnap();

      dispatch({
        type: MetamaskActions.SetInstalled,
        payload: installedSnap,
      });
    } catch (error) {
      console.error(error);
      dispatch({ type: MetamaskActions.SetError, payload: error });
    }
  };

  const getAccounts = async () => {
    try {
      const _accounts = await sendListAccounts();
      console.log(_accounts);
      const _selectedAccount = _accounts.find((acc: Account) => acc.isSelected);
      setAccounts(_accounts);
      // setSelectedAccount(_selectedAccount);
      buildReefSigner(_selectedAccount?.address);
    } catch (error) {
      console.error(error);
      dispatch({ type: MetamaskActions.SetError, payload: error });
    }
  };

  const createSeed = async () => {
    try {
      const res = (await sendCreateSeed()) as { address: string; seed: string };
      console.log(res);
      setSeed(res.seed);
    } catch (error) {
      console.error(error);
      dispatch({ type: MetamaskActions.SetError, payload: error });
    }
  };

  const createAccount = async () => {
    if (!seed) throw new Error('Seed is required');
    try {
      const createdAddress = await sendCreateAccountWithSeed(
        seed,
        'New Account',
      );
      console.log(createdAddress);
      getAccounts();
    } catch (error) {
      console.error(error);
      dispatch({ type: MetamaskActions.SetError, payload: error });
    }
  };

  const deleteAccount = async () => {
    if (!addressDelete) throw new Error('No account to delete');
    try {
      await sendForgetAccount(addressDelete);
      console.log('Account deleted');
      getAccounts();
    } catch (error) {
      console.error(error);
      dispatch({ type: MetamaskActions.SetError, payload: error });
    }
  };

  const importAccountsFromJson = async () => {
    const json = {
      encoded:
        'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      encoding: {
        content: ['batch-pkcs8'],
        type: ['scrypt', 'xsalsa20-poly1305'],
        version: '3',
      },
      accounts: [
        {
          address: '5C4umxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          meta: {
            _isSelectedTs: 1687958250560,
            genesisHash: '',
            name: 'Reef-1',
            whenCreated: 1658132263282,
          },
        },
        {
          address: '5CqNxQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          meta: {
            _isSelectedTs: 1691135429767,
            genesisHash: '',
            name: 'Reef-2',
            whenCreated: 1658132183325,
          },
        },
      ],
    };
    const password = 'my_password';

    await sendImportAccountsFromJson(json, password);
    getAccounts();
  };

  const buildReefSigner = async (address: string) => {
    const _provider = provider || (await updateProvider(network));
    const signer = new Signer();
    const newReefVmSigner = new ReefVMSigner(_provider, address, signer);
    setReefVmSigner(newReefVmSigner);
    console.log('Reef signer built:', newReefVmSigner);
  };

  const flipValue = async () => {
    if (!reefVmSigner) throw new Error('Reef signer is required');
    try {
      var ctrRes = await flipIt(reefVmSigner);
      console.log('flipped=', ctrRes);
      getFlipperValue(reefVmSigner);
    } catch (e) {
      console.log(e);
    }
  };

  const getFlipValue = async () => {
    if (!reefVmSigner) throw new Error('Reef signer is required');
    try {
      var ctrRes = await getFlipperValue(reefVmSigner);
      console.log('flipper value=', ctrRes);
    } catch (e) {
      console.log(e);
    }
  };

  const signBytes = async () => {
    if (!reefVmSigner) throw new Error('Reef signer is required');
    try {
      const messageSigned = await reefVmSigner.signingKey.signRaw!({
        address: reefVmSigner._substrateAddress,
        data: 'hello world',
        type: 'bytes',
      });
      console.log('messaged signed:', messageSigned);
    } catch (e) {
      console.log(e);
    }
  };

  const setStore = async () => {
    const res = await sendToSnap('setStore', {
      address: seed || 'test',
    });
    console.log(res);
  };

  const getStore = async () => {
    const res = await sendToSnap('getStore', {
      address: seed || 'test',
    });
    console.log(res);
  };

  const getAllAccounts = async () => {
    const res = await sendToSnap('getAllAccounts');
    console.log(res);
  };

  const getAllMetadata = async () => {
    const res = await sendToSnap('getAllMetadatas');
    console.log(res);
  };

  const removeStore = async () => {
    const res = await sendToSnap('removeStore', {
      address: seed || 'test',
    });
    console.log(res);
  };

  const clearStores = async () => {
    const res = await sendToSnap('clearAllStores');
    console.log(res);
  };

  const listMetadata = async () => {
    const res = await sendToSnap('listMetadata');
    console.log(res);
  };

  const updateMetadata = async () => {
    const _provider = provider || (await updateProvider(network));
    const metadata = getMetadata(_provider.api);
    const res = await sendToSnap('provideMetadata', metadata);
    console.log(res);
  };

  const getNetwork = async () => {
    const _network = await sendGetNetwork();
    setNetwork(_network);
    return _network;
  };

  const switchNetwork = async () => {
    const _network = await sendSetNetwork(
      network?.name === 'testnet' ? 'mainnet' : 'testnet',
    );
    setNetwork(_network);
  };

  const updateProvider = async (network?: Network) => {
    let _network = network;
    if (!_network) {
      _network = await getNetwork();
      setNetwork(_network);
    }

    const _provider = new Provider({
      provider: new WsProvider(_network.rpcUrl),
    });

    try {
      await _provider.api.isReadyOrError;
    } catch (e) {
      console.log('Provider isReadyOrError ERROR=', e);
      throw e;
    }

    setProvider(_provider);
    return _provider;
  };

  const handleSelectAccount = async (event: any) => {
    const res = await sendToSnap('selectAccount', {
      addressSelect: event.target.value,
    });
    console.log(res);
    getAccounts();
  };

  return (
    <Container>
      <Heading>
        <Span>Reef Chain snap</Span>
      </Heading>
      <Subtitle>
        {state.installedSnap && <div>Network: {network?.name || '-'}</div>}
        {network?.name && (
          <Toggle
            onToggle={switchNetwork}
            defaultChecked={network?.name === 'mainnet'}
          />
        )}
      </Subtitle>
      {accounts.length > 0 && (
        <SelectInput
          value={reefVmSigner?._substrateAddress}
          onChange={handleSelectAccount}
        >
          <Option value="">Select account...</Option>
          {accounts.map((account, index) => (
            <Option key={index} value={account.address}>
              {account.address} - {account.name}
              {account.isSelected ? ' ✅' : ''}
            </Option>
          ))}
        </SelectInput>
      )}
      <CardContainer>
        {state.error && (
          <ErrorMessage>
            <b>An error happened:</b> {state.error.message}
          </ErrorMessage>
        )}
        {!isMetaMaskReady && (
          <Card
            content={{
              title: 'Install',
              description:
                'Snaps is pre-release software only available in MetaMask Flask, a canary distribution for developers with access to upcoming features.',
              button: <InstallFlaskButton />,
            }}
            fullWidth
          />
        )}
        {!state.installedSnap && (
          <Card
            content={{
              title: 'Connect',
              description:
                'Get started by connecting to and installing the example snap.',
              button: (
                <ConnectButton onClick={connect} disabled={!isMetaMaskReady} />
              ),
            }}
            disabled={!isMetaMaskReady}
          />
        )}
        {shouldDisplayReconnectButton(state.installedSnap) && (
          <Card
            content={{
              title: 'Reconnect',
              description:
                'While connected to a local running snap this button will always be displayed in order to update the snap if a change is made.',
              button: (
                <ReconnectButton
                  onClick={connect}
                  disabled={!state.installedSnap}
                />
              ),
            }}
            disabled={!state.installedSnap}
          />
        )}
        <Card
          content={{
            title: 'Init keyring',
            button: (
              <Button
                onClick={() => sendToSnap('initKeyring')}
                disabled={!state.installedSnap}
              >
                Init keyring
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'List accounts',
            description: 'Get list of accounts.',
            button: (
              <Button
                onClick={() => getAccounts()}
                disabled={!state.installedSnap}
              >
                List accounts
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Create mnemonic',
            description: 'Generate a mnemonic for a new Reef account.',
            button: (
              <Button onClick={createSeed} disabled={!state.installedSnap}>
                Create mnemonic
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Create account',
            description: 'Create new Reef account from mnemonic.',
            button: (
              <Button onClick={createAccount} disabled={!state.installedSnap}>
                Create account
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Import from mnemonic',
            description: 'Import existing account from mnemonic.',
            input: (
              <TextArea onChange={(event) => setSeed(event.target.value)} />
            ),
            button: (
              <Button
                onClick={() => createAccount()}
                disabled={!state.installedSnap}
              >
                Import account
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Delete account',
            input: (
              <TextArea
                onChange={(event) => setAddressDelete(event.target.value)}
              />
            ),
            button: (
              <Button
                onClick={() => deleteAccount()}
                disabled={!state.installedSnap}
              >
                Delete account
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        {/* <Card
          content={{
            title: 'Import from JSON',
            description: 'Import accounts from JSON file.',
            button: (
              <Button
                onClick={() => importAccountsFromJson()}
                disabled={!state.installedSnap}
              >
                Import accounts
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        /> */}
        <Card
          content={{
            title: 'Flip',
            description: 'Switch flipper value.',
            button: (
              <Button
                onClick={() => flipValue()}
                disabled={!state.installedSnap}
              >
                Flip it!
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Get flipper value',
            description: 'Get the value of the flipper.',
            button: (
              <Button
                onClick={() => getFlipValue()}
                disabled={!state.installedSnap}
              >
                Get flipper value
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Sign bytes',
            description: 'Sign raw message.',
            button: (
              <Button
                onClick={() => signBytes()}
                disabled={!state.installedSnap}
              >
                Sign bytes
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Set store',
            description: 'Set store value.',
            button: (
              <Button
                onClick={() => setStore()}
                disabled={!state.installedSnap}
              >
                Set store
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Get store',
            description: 'Get store value.',
            button: (
              <Button
                onClick={() => getStore()}
                disabled={!state.installedSnap}
              >
                Get store
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Get all accounts from store',
            button: (
              <Button
                onClick={() => getAllAccounts()}
                disabled={!state.installedSnap}
              >
                Get accounts
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Get metadatas from store',
            button: (
              <Button
                onClick={() => getAllMetadata()}
                disabled={!state.installedSnap}
              >
                Get metadatas
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Remove store',
            description: 'Remove store value.',
            button: (
              <Button
                onClick={() => removeStore()}
                disabled={!state.installedSnap}
              >
                Remove store
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Clear stores',
            description: 'Clear all stores.',
            button: (
              <Button
                onClick={() => clearStores()}
                disabled={!state.installedSnap}
              >
                Clear stores
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'List metadata',
            description: 'List all metadata definitions stored in snap.',
            button: (
              <Button
                onClick={() => listMetadata()}
                disabled={!state.installedSnap}
              >
                List metadata
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
        <Card
          content={{
            title: 'Update metadata',
            description:
              'Update to the latest metadata version on the selected network.',
            button: (
              <Button
                onClick={() => updateMetadata()}
                disabled={!state.installedSnap}
              >
                Update metadata
              </Button>
            ),
          }}
          disabled={!state.installedSnap}
          fullWidth={
            isMetaMaskReady &&
            Boolean(state.installedSnap) &&
            !shouldDisplayReconnectButton(state.installedSnap)
          }
        />
      </CardContainer>
    </Container>
  );
};

export default Index;
