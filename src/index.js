/*!
 * Copyright 2017 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

import assert from 'assert';
import bun from 'bun';
import extend from 'extend';
import is from 'is';
import pkgUp from 'pkg-up';
import through2 from 'through2';
import util from 'util';

import {referencePkg} from './reference';
import {documentPkg} from './document';
import {fieldValuePkg} from './field-value';
import {validatePkg} from './validate';
import {writeBatchPkg} from './write-batch';
import {transactionPkg} from './transaction';
import {Timestamp} from './timestamp';
import {FieldPath, ResourcePath} from './path';
import {ClientPool} from './pool';

import * as convert from './convert';

const libVersion = require(pkgUp.sync(__dirname)).version;

/*!
 * DO NOT REMOVE THE FOLLOWING NAMESPACE DEFINITIONS
 */

/**
 * @namespace google.protobuf
 */

/**
 * @namespace google.rpc
 */

/**
 * @namespace google.firestore.v1beta1
 */


/*!
 * @see CollectionReference
 */
let CollectionReference;

/*!
 * @see DocumentReference
 */
let DocumentReference;

/*!
 * @see DocumentSnapshot
 */
let DocumentSnapshot;

/*!
 * @see GeoPoint
 */
let GeoPoint;

/*!
 * @see FieldValue
 */
let FieldValue;

/*! Injected. */
let validate;

/*!
 * @see WriteBatch
 */
let WriteBatch;

/*!
 * @see Transaction
 */
let Transaction;

/*!
 * @see v1beta1
 */
let v1beta1;  // Lazy-loaded in `_runRequest()`

/*!
 * @see @google-cloud/common
 */
let common;  // Lazy-loaded in `_runRequest()`

/*!
 * HTTP header for the resource prefix to improve routing and project isolation
 * by the backend.
 * @type {string}
 */
const CLOUD_RESOURCE_HEADER = 'google-cloud-resource-prefix';

/*!
 * The maximum number of times to retry idempotent requests.
 * @type {number}
 */
const MAX_REQUEST_RETRIES = 5;

/*!
 * The maximum number of concurrent requests supported by a single GRPC channel,
 * as enforced by Google's Frontend. If the SDK issues more than 100 concurrent
 * operations, we need to use more than one GAPIC client since these clients
 * multiplex all requests over a single channel.
 *
 * @type {number}
 */
const MAX_CONCURRENT_REQUESTS_PER_CLIENT = 100;

/*!
 * GRPC Error code for 'UNAVAILABLE'.
 * @type {number}
 */
const GRPC_UNAVAILABLE = 14;

/**
 * Document data (e.g. for use with
 * [set()]{@link DocumentReference#set}) consisting of fields mapped
 * to values.
 *
 * @typedef {Object.<string, *>} DocumentData
 */

/**
 * Update data (for use with [update]{@link DocumentReference#update})
 * that contains paths (e.g. 'foo' or 'foo.baz') mapped to values. Fields that
 * contain dots reference nested fields within the document.
 *
 * @typedef {Object.<string, *>} UpdateData
 */

/**
 * An options object that configures conditional behavior of
 * [update()]{@link DocumentReference#update} and
 * [delete()]{@link DocumentReference#delete} calls in
 * [DocumentReference]{@link DocumentReference},
 * [WriteBatch]{@link WriteBatch}, and
 * [Transaction]{@link Transaction}. Using Preconditions, these calls
 * can be restricted to only apply to documents that match the specified
 * conditions.
 *
 * @property {string} lastUpdateTime - The update time to enforce (specified as
 * an ISO 8601 string).
 * @typedef {Object} Precondition
 */

/**
 * An options object that configures the behavior of
 * [set()]{@link DocumentReference#set} calls in
 * [DocumentReference]{@link DocumentReference},
 * [WriteBatch]{@link WriteBatch}, and
 * [Transaction]{@link Transaction}. These calls can be
 * configured to perform granular merges instead of overwriting the target
 * documents in their entirety by providing a SetOptions object with
 * { merge : true }.
 *
 * @property {boolean} merge - Changes the behavior of a set() call to only
 * replace the values specified in its data argument. Fields omitted from the
 * set() call remain untouched.
 * @typedef {Object} SetOptions
 */

/**
 * The Firestore client represents a Firestore Database and is the entry point
 * for all Firestore operations.
 *
 * @see [Firestore Documentation]{@link https://firebase.google.com/docs/firestore/}
 *
 * @class
 *
 * @example <caption>Install the client library with <a
 * href="https://www.npmjs.com/">npm</a>:</caption> npm install --save
 * @google-cloud/firestore
 *
 * @example <caption>Import the client library</caption>
 * var Firestore = require('@google-cloud/firestore');
 *
 * @example <caption>Create a client that uses <a
 * href="https://cloud.google.com/docs/authentication/production#providing_credentials_to_your_application">Application
 * Default Credentials (ADC)</a>:</caption> var firestore = new Firestore();
 *
 * @example <caption>Create a client with <a
 * href="https://cloud.google.com/docs/authentication/production#obtaining_and_providing_service_account_credentials_manually">explicit
 * credentials</a>:</caption> var firestore = new Firestore({ projectId:
 * 'your-project-id', keyFilename: '/path/to/keyfile.json'
 * });
 *
 * @example <caption>include:samples/quickstart.js</caption>
 * region_tag:firestore_quickstart
 * Full quickstart example:
 */
class Firestore {
  /**
   * @param {Object=} settings - [Configuration object](#/docs).
   * @param {string=} settings.projectId The Firestore Project ID. Can be
   * omitted in environments that support `Application Default Credentials`
   * {@see https://cloud.google.com/docs/authentication}
   * @param {string=} settings.keyFilename Local file containing the Service
   * Account credentials. Can be omitted in environments that support
   * `Application Default Credentials`
   * {@see https://cloud.google.com/docs/authentication}
   * @param {boolean=} settings.timestampsInSnapshots Enables the use of
   * `Timestamp`s for timestamp fields in `DocumentSnapshots`.<br/>
   * Currently, Firestore returns timestamp fields as `Date` but `Date` only
   * supports millisecond precision, which leads to truncation and causes
   * unexpected behavior when using a timestamp from a snapshot as a part
   * of a subsequent query.
   * <br/>Setting `timestampsInSnapshots` to true will cause Firestore to return
   * `Timestamp` values instead of `Date` avoiding this kind of problem. To
   * make this work you must also change any code that uses `Date` to use
   * `Timestamp` instead.
   * <br/>NOTE: in the future `timestampsInSnapshots: true` will become the
   * default and this option will be removed so you should change your code to
   * use `Timestamp` now and opt-in to this new behavior as soon as you can.
   */
  constructor(settings) {
    settings = extend({}, settings, {
      libName: 'gccl',
      libVersion: libVersion,
    });

    /**
     * A client pool to distribute requests over multiple GAPIC clients in order
     * to work around a connection limit of 100 concurrent requests per client.
     * @private
     * @type {ClientPool|null}
     */
    this._clientPool = null;

    /**
     * Whether the initialization settings can still be changed by invoking
     * `settings()`.
     * @private
     * @type {boolean}
     */
    this._settingsFrozen = false;

    /**
     * A Promise that resolves when client initialization completes. Can be
     * 'null' if initialization hasn't started yet.
     * @private
     * @type {Promise|null}
     */
    this._clientInitialized = null;

    /**
     * The configuration options for the GAPIC client.
     * @private
     * @type {Object}
     */
    this._initalizationSettings = null;

    this.validateAndApplySettings(settings);

    // GCF currently tears down idle connections after two minutes. Requests
    // that are issued after this period may fail. On GCF, we therefore issue
    // these requests as part of a transaction so that we can safely retry until
    // the network link is reestablished.
    //
    // The environment variable FUNCTION_TRIGGER_TYPE is used to detect the GCF
    // environment.
    this._preferTransactions = is.defined(process.env.FUNCTION_TRIGGER_TYPE);
    this._lastSuccessfulRequest = null;

    if (this._preferTransactions) {
      Firestore.log('Firestore', null, 'Detected GCF environment');
    }

    Firestore.log('Firestore', null, 'Initialized Firestore');
  }

  /**
   * Specifies custom settings to be used to configure the `Firestore`
   * instance. Can only be invoked once and before any other Firestore method.
   *
   * If settings are provided via both `settings()` and the `Firestore`
   * constructor, both settings objects are merged and any settings provided via
   * `settings()` take precedence.
   *
   * @param {object} settings The settings to use for all Firestore operations.
   */
  settings(settings) {
    validate.isObject('settings', settings);
    validate.isOptionalString('settings.projectId', settings.projectId);
    validate.isOptionalBoolean(
        'settings.timestampsInSnapshots', settings.timestampsInSnapshots);

    if (this._clientInitialized) {
      throw new Error(
          'Firestore has already been started and its settings can no longer ' +
          'be changed. You can only call settings() before calling any other ' +
          'methods on a Firestore object.');
    }

    if (this._settingsFrozen) {
      throw new Error(
          'Firestore.settings() has already be called. You can only call ' +
          'settings() once, and only before calling any other methods on a ' +
          'Firestore object.');
    }

    const mergedSettings = extend({}, this._initalizationSettings, settings);
    this.validateAndApplySettings(mergedSettings);
    this._settingsFrozen = true;
  }

  validateAndApplySettings(settings) {
    validate.isOptionalBoolean(
        'settings.timestampsInSnapshots', settings.timestampsInSnapshots);
    this._timestampsInSnapshotsEnabled = !!settings.timestampsInSnapshots;

    if (settings && settings.projectId) {
      validate.isString('settings.projectId', settings.projectId);
      this._referencePath = new ResourcePath(settings.projectId, '(default)');
    } else {
      // Initialize a temporary reference path that will be overwritten during
      // project ID detection.
      this._referencePath = new ResourcePath('{{projectId}}', '(default)');
    }

    this._initalizationSettings = settings;
  }

  /**
   * The root path to the database.
   *
   * @private
   * @type {string}
   */
  get formattedName() {
    return this._referencePath.formattedName;
  }

  /**
   * Gets a [DocumentReference]{@link DocumentReference} instance that
   * refers to the document at the specified path.
   *
   * @param {string} documentPath - A slash-separated path to a document.
   * @returns {DocumentReference} The
   * [DocumentReference]{@link DocumentReference} instance.
   *
   * @example
   * let documentRef = firestore.doc('collection/document');
   * console.log(`Path of document is ${documentRef.path}`);
   */
  doc(documentPath) {
    validate.isResourcePath('documentPath', documentPath);

    let path = this._referencePath.append(documentPath);
    if (!path.isDocument) {
      throw new Error(`Argument "documentPath" must point to a document, but was "${
          documentPath}". Your path does not contain an even number of components.`);
    }

    return new DocumentReference(this, path);
  }

  /**
   * Gets a [CollectionReference]{@link CollectionReference} instance
   * that refers to the collection at the specified path.
   *
   * @param {string} collectionPath - A slash-separated path to a collection.
   * @returns {CollectionReference} The
   * [CollectionReference]{@link CollectionReference} instance.
   *
   * @example
   * let collectionRef = firestore.collection('collection');
   *
   * // Add a document with an auto-generated ID.
   * collectionRef.add({foo: 'bar'}).then((documentRef) => {
   *   console.log(`Added document at ${documentRef.path})`);
   * });
   */
  collection(collectionPath) {
    validate.isResourcePath('collectionPath', collectionPath);

    let path = this._referencePath.append(collectionPath);
    if (!path.isCollection) {
      throw new Error(`Argument "collectionPath" must point to a collection, but was "${
          collectionPath}". Your path does not contain an odd number of components.`);
    }

    return new CollectionReference(this, path);
  }

  /**
   * Creates a [WriteBatch]{@link WriteBatch}, used for performing
   * multiple writes as a single atomic operation.
   *
   * @returns {WriteBatch} A WriteBatch that operates on this Firestore
   * client.
   *
   * @example
   * let writeBatch = firestore.batch();
   *
   * // Add two documents in an atomic batch.
   * let data = { foo: 'bar' };
   * writeBatch.set(firestore.doc('col/doc1'), data);
   * writeBatch.set(firestore.doc('col/doc2'), data);
   *
   * writeBatch.commit().then(res => {
   *   console.log(`Added document at ${res.writeResults[0].updateTime}`);
   * });
   */
  batch() {
    return new WriteBatch(this);
  }

  /**
   * Creates a [DocumentSnapshot]{@link DocumentSnapshot} or a
   * [QueryDocumentSnapshot]{@link QueryDocumentSnapshot} from a
   * `firestore.v1beta1.Document` proto (or from a resource name for missing
   * documents).
   *
   * This API is used by Google Cloud Functions and can be called with both
   * 'Proto3 JSON' and 'Protobuf JS' encoded data.
   *
   * @private
   * @param {object|string} documentOrName - The Firestore 'Document' proto or
   * the resource name of a missing document.
   * @param {object=} readTime - A 'Timestamp' proto indicating the time this
   * document was read.
   * @param {string=} encoding - One of 'json' or 'protobufJS'. Applies to both
   * the 'document' Proto and 'readTime'. Defaults to 'protobufJS'.
   * @returns {DocumentSnapshot|QueryDocumentSnapshot} - A QueryDocumentSnapshot
   * for existing documents, otherwise a DocumentSnapshot.
   */
  snapshot_(documentOrName, readTime, encoding) {
    // TODO: Assert that Firestore Project ID is valid.

    let convertTimestamp;
    let convertDocument;

    if (!is.defined(encoding) || encoding === 'protobufJS') {
      convertTimestamp = data => data;
      convertDocument = data => data;
    } else if (encoding === 'json') {
      // Google Cloud Functions calls us with Proto3 JSON format data, which we
      // must convert to Protobuf JS.
      convertTimestamp = convert.timestampFromJson;
      convertDocument = convert.documentFromJson;
    } else {
      throw new Error(
          `Unsupported encoding format. Expected 'json' or 'protobufJS', ` +
          `but was '${encoding}'.`);
    }

    const document = new DocumentSnapshot.Builder();

    if (is.string(documentOrName)) {
      document.ref = new DocumentReference(
          this, ResourcePath.fromSlashSeparatedString(documentOrName));
    } else {
      document.ref = new DocumentReference(
          this, ResourcePath.fromSlashSeparatedString(documentOrName.name));
      document.fieldsProto =
          documentOrName.fields ? convertDocument(documentOrName.fields) : {};
      document.createTime = Timestamp.fromProto(convertTimestamp(
          documentOrName.createTime, 'documentOrName.createTime'));
      document.updateTime = Timestamp.fromProto(convertTimestamp(
          documentOrName.updateTime, 'documentOrName.updateTime'));
    }

    if (readTime) {
      document.readTime =
          Timestamp.fromProto(convertTimestamp(readTime, 'readTime'));
    }

    return document.build();
  }

  /**
   * Executes the given updateFunction and commits the changes applied within
   * the transaction.
   *
   * You can use the transaction object passed to 'updateFunction' to read and
   * modify Firestore documents under lock. Transactions are committed once
   * 'updateFunction' resolves and attempted up to five times on failure.
   *
   * @param {function(Transaction)} updateFunction - The
   * function to execute within the transaction
   * context.
   * @param {object=} transactionOptions - Transaction options.
   * @param {number=} transactionOptions.maxAttempts - The maximum number of
   * attempts for this transaction.
   * @returns {Promise} If the transaction completed successfully or was
   * explicitly aborted (by the updateFunction returning a failed Promise), the
   * Promise returned by the updateFunction will be returned here. Else if the
   * transaction failed, a rejected Promise with the corresponding failure
   * error will be returned.
   *
   * @example
   * let counterTransaction = firestore.runTransaction(transaction => {
   *   let documentRef = firestore.doc('col/doc');
   *   return transaction.get(documentRef).then(doc => {
   *     if (doc.exists) {
   *       let count =  doc.get('count') || 0;
   *       if (count > 10) {
   *         return Promise.reject('Reached maximum count');
   *       }
   *       transaction.update(documentRef, { count: ++count });
   *       return Promise.resolve(count);
   *     }
   *
   *     transaction.create(documentRef, { count: 1 });
   *     return Promise.resolve(1);
   *   });
   * });
   *
   * counterTransaction.then(res => {
   *   console.log(`Count updated to ${res}`);
   * });
   */
  runTransaction(updateFunction, transactionOptions) {
    validate.isFunction('updateFunction', updateFunction);

    const defaultAttempts = 5;

    let attemptsRemaining = defaultAttempts;
    let previousTransaction;

    if (is.defined(transactionOptions)) {
      validate.isObject('transactionOptions', transactionOptions);
      validate.isOptionalInteger(
          'transactionOptions.maxAttempts', transactionOptions.maxAttempts, 1);

      attemptsRemaining = transactionOptions.maxAttempts || attemptsRemaining;
      previousTransaction = transactionOptions.previousTransaction;
    }

    const transaction = new Transaction(this, previousTransaction);
    const requestTag = transaction.requestTag;
    let result;

    --attemptsRemaining;

    return transaction.begin()
        .then(() => {
          let promise = updateFunction(transaction);
          result = is.instanceof(promise, Promise) ?
              promise :
              Promise.reject(new Error(
                  'You must return a Promise in your transaction()-callback.'));
          return result.catch(err => {
            Firestore.log(
                'Firestore.runTransaction', requestTag,
                'Rolling back transaction after callback error:', err);
            // Rollback the transaction and return the failed result.
            return transaction.rollback().then(() => {
              return result;
            });
          });
        })
        .then(() => {
          return transaction.commit().then(() => result).catch(err => {
            if (attemptsRemaining > 0) {
              Firestore.log(
                  'Firestore.runTransaction', requestTag,
                  `Retrying transaction after error: ${JSON.stringify(err)}.`);
              return this.runTransaction(updateFunction, {
                previousTransaction: transaction,
                maxAttempts: attemptsRemaining,
              });
            }
            Firestore.log(
                'Firestore.runTransaction', requestTag,
                'Exhausted transaction retries, returning error: %s', err);
            return Promise.reject(err);
          });
        });
  }

  /**
   * Fetches the root collections that are associated with this Firestore
   * database.
   *
   * @returns {Promise.<Array.<CollectionReference>>} A Promise that resolves
   * with an array of CollectionReferences.
   *
   * @example
   * firestore.getCollections().then(collections => {
   *   for (let collection of collections) {
   *     console.log(`Found collection with id: ${collection.id}`);
   *   }
   * });
   */
  getCollections() {
    let rootDocument = new DocumentReference(this, this._referencePath);
    return rootDocument.getCollections();
  }

  /**
   * Retrieves multiple documents from Firestore.
   *
   * @param {...DocumentReference} documents - The document references
   * to receive.
   * @returns {Promise<Array.<DocumentSnapshot>>} A Promise that
   * contains an array with the resulting document snapshots.
   *
   * @example
   * let documentRef1 = firestore.doc('col/doc1');
   * let documentRef2 = firestore.doc('col/doc2');
   *
   * firestore.getAll(documentRef1, documentRef2).then(docs => {
   *   console.log(`First document: ${JSON.stringify(docs[0])}`);
   *   console.log(`Second document: ${JSON.stringify(docs[1])}`);
   * });
   */
  getAll(documents) {
    documents = is.array(arguments[0]) ? arguments[0].slice() :
                                         Array.prototype.slice.call(arguments);

    for (let i = 0; i < documents.length; ++i) {
      validate.isDocumentReference(i, documents[i]);
    }

    return this.getAll_(documents, Firestore.requestTag());
  }

  /**
   * Internal method to retrieve multiple documents from Firestore, optionally
   * as part of a transaction.
   *
   * @private
   * @param {Array.<DocumentReference>} docRefs - The documents
   * to receive.
   * @param {string} requestTag A unique client-assigned identifier for this
   * request.
   * @param {bytes=} transactionId - transactionId - The transaction ID to use
   * for this read.
   * @returns {Promise<Array.<DocumentSnapshot>>} A Promise that contains an array with
   * the resulting documents.
   */
  getAll_(docRefs, requestTag, transactionId) {
    const requestedDocuments = new Set();
    const retrievedDocuments = new Map();

    let request = {
      database: this.formattedName,
      transaction: transactionId,
    };

    for (let docRef of docRefs) {
      requestedDocuments.add(docRef.formattedName);
    }

    request.documents = Array.from(requestedDocuments);

    const self = this;

    return self.readStream('batchGetDocuments', request, requestTag, true)
        .then(stream => {
          return new Promise((resolve, reject) => {
            stream
                .on('error',
                    err => {
                      Firestore.log(
                          'Firestore.getAll_', requestTag,
                          'GetAll failed with error:', err);
                      reject(err);
                    })
                .on('data',
                    response => {
                      try {
                        let document;

                        if (response.found) {
                          Firestore.log(
                              'Firestore.getAll_', requestTag,
                              'Received document: %s', response.found.name);
                          document =
                              self.snapshot_(response.found, response.readTime);
                        } else {
                          Firestore.log(
                              'Firestore.getAll_', requestTag,
                              'Document missing: %s', response.missing);
                          document = self.snapshot_(
                              response.missing, response.readTime);
                        }

                        let path = document.ref.path;
                        retrievedDocuments.set(path, document);
                      } catch (err) {
                        Firestore.log(
                            'Firestore.getAll_', requestTag,
                            'GetAll failed with exception:', err);
                        reject(err);
                      }
                    })
                .on('end', () => {
                  Firestore.log(
                      'Firestore.getAll_', requestTag, 'Received %d results',
                      retrievedDocuments.size);

                  // BatchGetDocuments doesn't preserve document order. We use
                  // the request order to sort the resulting documents.
                  const orderedDocuments = [];
                  for (let docRef of docRefs) {
                    let document = retrievedDocuments.get(docRef.path);
                    if (!is.defined(document)) {
                      reject(new Error(
                          `Did not receive document for "${docRef.path}".`));
                    }
                    orderedDocuments.push(document);
                  }
                  resolve(orderedDocuments);
                });
            stream.resume();
          });
        });
  }

  /**
   * Generate a unique client-side identifier.
   *
   * Used for the creation of new documents.
   *
   * @private
   * @returns {string} A unique 20-character wide identifier.
   */
  static autoId() {
    let chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let autoId = '';
    for (let i = 0; i < 20; i++) {
      autoId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return autoId;
  }

  /**
   * Generate a short and semi-random client-side identifier.
   *
   * Used for the creation of request tags.
   *
   * @private
   * @returns {string} A random 5-character wide identifier.
   */
  static requestTag() {
    return Firestore.autoId().substr(0, 5);
  }

  /**
   * Executes a new request using the first available GAPIC client.
   *
   * @private
   */
  _runRequest(op) {
    // Initialize the client pool if this is the first request.
    if (!this._clientInitialized) {
      common = require('@google-cloud/common');

      if (!this._timestampsInSnapshotsEnabled) {
        console.error(`
The behavior for Date objects stored in Firestore is going to change
AND YOUR APP MAY BREAK.
To hide this warning and ensure your app does not break, you need to add the
following code to your app before calling any other Cloud Firestore methods:

  const firestore = new Firestore();
  const settings = {/* your settings... */ timestampsInSnapshots: true};
  firestore.settings(settings);

With this change, timestamps stored in Cloud Firestore will be read back as
Firebase Timestamp objects instead of as system Date objects. So you will also
need to update code expecting a Date to instead expect a Timestamp. For example:

  // Old:
  const date = snapshot.get('created_at');
  // New:
  const timestamp = snapshot.get('created_at');
  const date = timestamp.toDate();

Please audit all existing usages of Date when you enable the new behavior. In a
future release, the behavior will change to the new behavior, so if you do not
follow these steps, YOUR APP MAY BREAK.`);
      }

      this._clientInitialized = this._initClientPool().then(clientPool => {
        this._clientPool = clientPool;
      });
    }

    return this._clientInitialized.then(() => this._clientPool.run(op));
  }

  /**
   * Initializes the client pool and invokes Project ID detection. Returns a
   * Promise on completion.
   *
   * @private
   * @return {Promise<ClientPool>}
   */
  _initClientPool() {
    assert(!this._clientInitialized, 'Client pool already initialized');

    const clientPool =
        new ClientPool(MAX_CONCURRENT_REQUESTS_PER_CLIENT, () => {
          const gapicClient =
              module.exports.v1beta1(this._initalizationSettings);
          Firestore.log(
              'Firestore', null, 'Initialized Firestore GAPIC Client');
          return gapicClient;
        });

    const projectIdProvided = this._referencePath.projectId !== '{{projectId}}';

    if (projectIdProvided) {
      return Promise.resolve(clientPool);
    } else {
      return clientPool.run(client => this._detectProjectId(client))
          .then(projectId => {
            this._referencePath =
                new ResourcePath(projectId, this._referencePath.databaseId);
            return clientPool;
          });
    }
  }

  /**
   * Auto-detects the Firestore Project ID.
   *
   * @private
   * @param {object} gapicClient - The Firestore GAPIC client.
   * @return {Promise<string>} A Promise that resolves with the Project ID.
   */
  _detectProjectId(gapicClient) {
    return new Promise(
        (resolve, reject) => {gapicClient.getProjectId((err, projectId) => {
          if (err) {
            Firestore.log(
                'Firestore._detectProjectId', null,
                'Failed to detect project ID: %s', err);
            reject(err);
          } else {
            Firestore.log(
                'Firestore._detectProjectId', null, 'Detected project ID: %s',
                projectId);
            resolve(projectId);
          }
        })});
  }
  /**
   * Decorate the request options of an API request. This is used to replace
   * any `{{projectId}}` placeholders with the value detected from the user's
   * environment, if one wasn't provided manually.
   *
   * @private
   */
  _decorateRequest(request) {
    let decoratedRequest = extend(true, {}, request);
    decoratedRequest = common.util.replaceProjectIdToken(
        decoratedRequest, this._referencePath.projectId);

    let decoratedGax = {otherArgs: {headers: {}}};
    decoratedGax.otherArgs.headers[CLOUD_RESOURCE_HEADER] = this.formattedName;

    return {request: decoratedRequest, gax: decoratedGax};
  }

  /**
   * A function returning a Promise that can be retried.
   *
   * @private
   * @callback retryFunction
   * @returns {Promise} A Promise indicating the function's success.
   */

  /**
   * Helper method that retries failed Promises.
   *
   * If 'delayMs' is specified, waits 'delayMs' between invocations. Otherwise,
   * schedules the first attempt immediately, and then waits 100 milliseconds
   * for further attempts.
   *
   * @private
   * @param {number} attemptsRemaining - The number of available attempts.
   * @param {string} requestTag - A unique client-assigned identifier for this
   * request.
   * @param {retryFunction} func - Method returning a Promise than can be
   * retried.
   * @param {number=} delayMs - How long to wait before issuing a this retry.
   * Defaults to zero.
   * @returns {Promise} - A Promise with the function's result if successful
   * within `attemptsRemaining`. Otherwise, returns the last rejected Promise.
   */
  _retry(attemptsRemaining, requestTag, func, delayMs) {
    let self = this;

    let currentDelay = delayMs || 0;
    let nextDelay = delayMs || 100;

    --attemptsRemaining;

    return new Promise(resolve => {
             setTimeout(resolve, currentDelay);
           })
        .then(func)
        .then(result => {
          self._lastSuccessfulRequest = new Date().getTime();
          return result;
        })
        .catch(err => {
          if (is.defined(err.code) && err.code !== GRPC_UNAVAILABLE) {
            Firestore.log(
                'Firestore._retry', requestTag,
                'Request failed with unrecoverable error:', err);
            return Promise.reject(err);
          }
          if (attemptsRemaining === 0) {
            Firestore.log(
                'Firestore._retry', requestTag,
                'Request failed with error:', err);
            return Promise.reject(err);
          }
          Firestore.log(
              'Firestore._retry', requestTag,
              'Retrying request that failed with error:', err);
          return self._retry(attemptsRemaining, requestTag, func, nextDelay);
        });
  }

  /**
   * Opens the provided stream and waits for it to become healthy. If an error
   * occurs before the first byte is read, the method rejects the returned
   * Promise.
   *
   * @private
   * @param {Stream} resultStream - The Node stream to monitor.
   * @param {string} requestTag A unique client-assigned identifier for this
   * request.
   * @param {Object=} request - If specified, the request that should be written
   * to the stream after it opened.
   * @returns {Promise.<Stream>} The given Stream once it is considered healthy.
   */
  _initializeStream(resultStream, requestTag, request) {
    /** The last error we received and have not forwarded yet. */
    let errorReceived = null;

    /**
     * Whether we have resolved the Promise and returned the stream to the
     * caller.
     */
    let streamReleased = false;

    /**
     * Whether the stream end has been reached. This has to be forwarded to the
     * caller..
     */
    let endCalled = false;

    return new Promise((resolve, reject) => {
      const releaseStream = () => {
        if (errorReceived) {
          Firestore.log(
              'Firestore._initializeStream', requestTag,
              'Emit error:', errorReceived);
          resultStream.emit('error', errorReceived);
          errorReceived = null;
        } else if (!streamReleased) {
          Firestore.log(
              'Firestore._initializeStream', requestTag, 'Releasing stream');
          streamReleased = true;
          resultStream.pause();

          // Calling 'stream.pause()' only holds up 'data' events and not the
          // 'end' event we intend to forward here. We therefore need to wait
          // until the API consumer registers their listeners (in the .then()
          // call) before emitting any further events.
          resolve(resultStream);

          // We execute the forwarding of the 'end' event via setTimeout() as
          // V8 guarantees that the above the Promise chain is resolved before
          // any calls invoked via setTimeout().
          setTimeout(() => {
            if (endCalled) {
              Firestore.log(
                  'Firestore._initializeStream', requestTag,
                  'Forwarding stream close');
              resultStream.emit('end');
            }
          }, 0);
        }
      };

      // We capture any errors received and buffer them until the caller has
      // registered a listener. We register our event handler as early as
      // possible to avoid the default stream behavior (which is just to log and
      // continue).
      resultStream.on('readable', () => {
        releaseStream();
      });

      resultStream.on('end', () => {
        Firestore.log(
            'Firestore._initializeStream', requestTag, 'Received stream end');
        endCalled = true;
        releaseStream();
      });

      resultStream.on('error', err => {
        Firestore.log(
            'Firestore._initializeStream', requestTag,
            'Received stream error:', err);
        // If we receive an error before we were able to receive any data,
        // reject this stream.
        if (!streamReleased) {
          Firestore.log(
              'Firestore._initializeStream', requestTag,
              'Received initial error:', err);
          streamReleased = true;
          reject(err);
        } else {
          errorReceived = err;
        }
      });

      if (is.defined(request)) {
        Firestore.log(
            'Firestore._initializeStream', requestTag, 'Sending request: %j',
            request);
        resultStream.write(request, 'utf-8', () => {
          Firestore.log(
              'Firestore._initializeStream', requestTag,
              'Marking stream as healthy');
          releaseStream();
        });
      }
    });
  }

  /**
   * A funnel for all non-streaming API requests, assigning a project ID where
   * necessary within the request options.
   *
   * @private
   * @param {function} methodName - Name of the veneer API endpoint that takes a
   * request and GAX options.
   * @param {Object} request - The Protobuf request to send.
   * @param {string} requestTag A unique client-assigned identifier for this
   * request.
   * @param {boolean} allowRetries - Whether this is an idempotent request that
   * can be retried.
   * @returns {Promise.<Object>} A Promise with the request result.
   */
  request(methodName, request, requestTag, allowRetries) {
    let attempts = allowRetries ? MAX_REQUEST_RETRIES : 1;

    return this._runRequest(gapicClient => {
      const decorated = this._decorateRequest(request);
      return this._retry(attempts, requestTag, () => {
        return new Promise((resolve, reject) => {
          Firestore.log(
              'Firestore.request', requestTag, 'Sending request: %j',
              decorated.request);
          gapicClient[methodName](
              decorated.request, decorated.gax, (err, result) => {
                if (err) {
                  Firestore.log(
                      'Firestore.request', requestTag, 'Received error:', err);
                  reject(err);
                } else {
                  Firestore.log(
                      'Firestore.request', requestTag, 'Received response: %j',
                      result);
                  resolve(result);
                }
              });
        });
      });
    });
  }

  /**
   * A funnel for read-only streaming API requests, assigning a project ID where
   * necessary within the request options.
   *
   * The stream is returned in paused state and needs to be resumed once all
   * listeners are attached.
   *
   * @private
   * @param {string} methodName - Name of the streaming Veneer API endpoint that
   * takes a request and GAX options.
   * @param {Object} request - The Protobuf request to send.
   * @param {string} requestTag A unique client-assigned identifier for this
   * request.
   * @param {boolean} allowRetries - Whether this is an idempotent request that
   * can be retried.
   * @returns {Promise.<Stream>} A Promise with the resulting read-only stream.
   */
  readStream(methodName, request, requestTag, allowRetries) {
    let attempts = allowRetries ? MAX_REQUEST_RETRIES : 1;

    return this._runRequest(gapicClient => {
      const decorated = this._decorateRequest(request);
      return this._retry(attempts, requestTag, () => {
        return new Promise((resolve, reject) => {
                 try {
                   Firestore.log(
                       'Firestore.readStream', requestTag,
                       'Sending request: %j', decorated.request);
                   let stream = gapicClient[methodName](
                       decorated.request, decorated.gax);
                   let logger = through2.obj(function(chunk, enc, callback) {
                     Firestore.log(
                         'Firestore.readStream', requestTag,
                         'Received response: %j', chunk);
                     this.push(chunk);
                     callback();
                   });
                   resolve(bun([stream, logger]));
                 } catch (err) {
                   Firestore.log(
                       'Firestore.readStream', requestTag,
                       'Received error:', err);
                   reject(err);
                 }
               })
            .then(stream => this._initializeStream(stream, requestTag));
      });
    });
  }

  /**
   * A funnel for read-write streaming API requests, assigning a project ID
   * where necessary for all writes.
   *
   * The stream is returned in paused state and needs to be resumed once all
   * listeners are attached.
   *
   * @private
   * @param {string} methodName - Name of the streaming Veneer API endpoint that
   * takes GAX options.
   * @param {Object} request - The Protobuf request to send as the first stream
   * message.
   * @param {string} requestTag A unique client-assigned identifier for this
   * request.
   * @param {boolean} allowRetries - Whether this is an idempotent request that
   * can be retried.
   * @returns {Promise.<Stream>} A Promise with the resulting read/write stream.
   */
  readWriteStream(methodName, request, requestTag, allowRetries) {
    let self = this;
    let attempts = allowRetries ? MAX_REQUEST_RETRIES : 1;

    return this._runRequest(gapicClient => {
      const decorated = this._decorateRequest(request);
      return this._retry(attempts, requestTag, () => {
        return Promise.resolve().then(() => {
          Firestore.log(
              'Firestore.readWriteStream', requestTag, 'Opening stream');
          // The generated bi-directional streaming API takes the list of GAX
          // headers as its second argument.
          let requestStream = gapicClient[methodName]({}, decorated.gax);

          // The transform stream to assign the project ID.
          let transform = through2.obj(function(chunk, encoding, callback) {
            let decoratedChunk = extend(true, {}, chunk);
            common.util.replaceProjectIdToken(
                decoratedChunk, self._referencePath.projectId);
            Firestore.log(
                'Firestore.readWriteStream', requestTag,
                'Streaming request: %j', decoratedChunk);
            requestStream.write(decoratedChunk, encoding, callback);
          });

          let logger = through2.obj(function(chunk, enc, callback) {
            Firestore.log(
                'Firestore.readWriteStream', requestTag,
                'Received response: %j', chunk);
            this.push(chunk);
            callback();
          });

          let resultStream = bun([transform, requestStream, logger]);
          return this._initializeStream(resultStream, requestTag, request);
        });
      });
    });
  }
}

/**
 * A logging function that takes a single string.
 *
 * @callback Firestore~logFunction
 * @param {string} Log message
 */

/**
 * Log function to use for debug output. By default, we don't perform any
 * logging.
 *
 * @private
 * @type {Firestore~logFunction}
 */
Firestore.log = function() {};

/**
 * Sets the log function for all active Firestore instances.
 *
 * @method Firestore.setLogFunction
 * @param {Firestore~logFunction} logger - A log function that takes a single
 * string.
 */
Firestore.setLogFunction = function(logger) {
  validate.isFunction('logger', logger);

  Firestore.log = function(methodName, requestTag, logMessage, varargs) {
    varargs = Array.prototype.slice.call(arguments, 2);
    requestTag = requestTag || '#####';

    let formattedMessage = util.format.apply(null, varargs);
    let time = new Date().toISOString();
    logger(
        `Firestore (${libVersion}) ${time} ${requestTag} [${methodName}]: ` +
        formattedMessage);
  };
};

// Initializing dependencies that require that Firestore class type.
const reference = referencePkg(Firestore);
CollectionReference = reference.CollectionReference;
DocumentReference = reference.DocumentReference;
const document = documentPkg(DocumentReference);
DocumentSnapshot = document.DocumentSnapshot;
GeoPoint = document.GeoPoint;
validate = validatePkg({
  DocumentReference: reference.validateDocumentReference,
  ResourcePath: ResourcePath.validateResourcePath,
});
const batch = writeBatchPkg(Firestore, DocumentReference);
WriteBatch = batch.WriteBatch;
Transaction = transactionPkg(Firestore);
FieldValue = fieldValuePkg(DocumentSnapshot).FieldValue;

/**
 * The default export of the `@google-cloud/firestore` package is the
 * {@link Firestore} class.
 *
 * See {@link Firestore} and {@link ClientConfig} for client methods and
 * configuration options.
 *
 * @module {Firestore} @google-cloud/firestore
 * @alias nodejs-firestore
 *
 * @example <caption>Install the client library with <a
 * href="https://www.npmjs.com/">npm</a>:</caption> npm install --save
 * @google-cloud/firestore
 *
 * @example <caption>Import the client library</caption>
 * var Firestore = require('@google-cloud/firestore');
 *
 * @example <caption>Create a client that uses <a
 * href="https://cloud.google.com/docs/authentication/production#providing_credentials_to_your_application">Application
 * Default Credentials (ADC)</a>:</caption> var firestore = new Firestore();
 *
 * @example <caption>Create a client with <a
 * href="https://cloud.google.com/docs/authentication/production#obtaining_and_providing_service_account_credentials_manually">explicit
 * credentials</a>:</caption> var firestore = new Firestore({ projectId:
 * 'your-project-id', keyFilename: '/path/to/keyfile.json'
 * });
 *
 * @example <caption>include:samples/quickstart.js</caption>
 * region_tag:firestore_quickstart
 * Full quickstart example:
 */
module.exports = Firestore;
module.exports.default = Firestore;
module.exports.Firestore = Firestore;

/**
 * {@link v1beta1} factory function.
 *
 * @name Firestore.v1beta1
 * @see v1beta1
 * @type {function}
 */
Object.defineProperty(module.exports, 'v1beta1', {
  // The v1beta1 module is very large. To avoid pulling it in from static
  // scope, we lazy-load and cache the module.
  get: () => {
    if (!v1beta1) {
      v1beta1 = require('./v1beta1');
    }
    return v1beta1;
  },
});

/**
 * {@link GeoPoint} class.
 *
 * @name Firestore.GeoPoint
 * @see GeoPoint
 * @type {Constructor}
 */
module.exports.GeoPoint = GeoPoint;

/**
 * {@link Transaction} class.
 *
 * @name Firestore.Transaction
 * @see Transaction
 * @type Transaction
 */
module.exports.Transaction = Transaction;

/**
 * {@link WriteBatch} class.
 *
 * @name Firestore.WriteBatch
 * @see WriteBatch
 * @type WriteBatch
 */
module.exports.WriteBatch = WriteBatch;

/**
 * {@link DocumentReference} class.
 *
 * @name Firestore.DocumentReference
 * @see DocumentReference
 * @type DocumentReference
 */
module.exports.DocumentReference = DocumentReference;

/**
 * {@link WriteResult} class.
 *
 * @name Firestore.WriteResult
 * @see WriteResult
 * @type WriteResult
 */
module.exports.WriteResult = batch.WriteResult;

/**
 * {@link DocumentSnapshot} DocumentSnapshot.
 *
 * @name Firestore.DocumentSnapshot
 * @see DocumentSnapshot
 * @type DocumentSnapshot
 */
module.exports.DocumentSnapshot = DocumentSnapshot;

/**
 * {@link QueryDocumentSnapshot} class.
 *
 * @name Firestore.QueryDocumentSnapshot
 * @see QueryDocumentSnapshot
 * @type QueryDocumentSnapshot
 */
module.exports.QueryDocumentSnapshot = document.QueryDocumentSnapshot;

/**
 * {@link CollectionReference} class.
 *
 * @name Firestore.CollectionReference
 * @see CollectionReference
 * @type CollectionReference
 */
module.exports.CollectionReference = CollectionReference;

/**
 * {@link QuerySnapshot} class.
 *
 * @name Firestore.QuerySnapshot
 * @see QuerySnapshot
 * @type QuerySnapshot
 */
module.exports.QuerySnapshot = reference.QuerySnapshot;

/**
 * {@link DocumentChange} class.
 *
 * @name Firestore.DocumentChange
 * @see DocumentChange
 * @type DocumentChange
 */
module.exports.DocumentChange = reference.DocumentChange;

/**
 * {@link Query} class.
 *
 * @name Firestore.Query
 * @see Query
 * @type Query
 */
module.exports.Query = reference.Query;

/**
 * {@link FieldValue} class.
 *
 * @name Firestore.FieldValue
 * @see FieldValue
 * @type FieldValue
 */
module.exports.FieldValue = FieldValue;

/**
 * {@link FieldPath} class.
 *
 * @name Firestore.FieldPath
 * @see FieldPath
 * @type {Constructor}
 */
module.exports.FieldPath = FieldPath;

/**
 * {@link Timestamp} class.
 *
 * @name Firestore.Timestamp
 * @see Timestamp
 * @type Timestamp
 */
module.exports.Timestamp = Timestamp;
