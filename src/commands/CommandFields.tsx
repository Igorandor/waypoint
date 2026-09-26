import { useId, useState } from 'react';
import { resolveSchema, plainDescription, type Schema } from '../../shared/schema';
import { emptyValue, candidateValue } from '../../shared/command-draft';
import { credentialField } from '../../shared/redaction';
import { human } from '../components/DataView';
export function CommandFields({
  schema: input,
  value,
  onChange,
  label = 'Command fields',
  previous,
  level = 0,
  hidden = false,
}: {
  schema: Schema;
  value: any;
  onChange: (value: any) => void;
  label?: string;
  previous?: any;
  level?: number;
  hidden?: boolean;
}) {
  const id = useId(),
    [key, setKey] = useState('');
  const schema = resolveSchema(input),
    secret = hidden || credentialField(label) || !!schema.writeOnly;
  if (level > 8) return <p>Maximum editable nesting reached.</p>;
  if (schema.type === 'array' || Array.isArray(value)) {
    const items = Array.isArray(value) ? value : [];
    return (
      <fieldset className="command-fields">
        <legend>{human(label)}</legend>
        {items.map((item, index) => (
          <div className="array-command" key={index}>
            <CommandFields
              schema={schema.items ?? { type: 'string' }}
              value={item}
              onChange={(next) => onChange(items.map((old, i) => (i === index ? next : old)))}
              label={'Entry ' + (index + 1)}
              level={level + 1}
              hidden={secret}
            />
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))}>
              Remove entry {index + 1}
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={items.length >= 200}
          onClick={() => onChange([...items, emptyValue(schema.items ?? { type: 'string' })])}
        >
          Append entry
        </button>
      </fieldset>
    );
  }
  if (schema.properties || schema.type === 'object' || (value && typeof value === 'object')) {
    const values = value && typeof value === 'object' ? value : {};
    const definitions = schema.properties ?? {};
    const available = Object.keys(definitions).filter(
      (name) => !Object.hasOwn(values, name) && !definitions[name].readOnly,
    );
    const free = !schema.properties || !!schema.additionalProperties;
    const add = (name: string) => {
      if (
        !name ||
        ['__proto__', 'constructor', 'prototype'].includes(name) ||
        Object.hasOwn(values, name)
      )
        return;
      onChange({
        ...values,
        [name]: candidateValue(definitions[name] ?? { type: 'string' }, previous?.[name]),
      });
      setKey('');
    };
    return (
      <fieldset className="command-fields">
        <legend>{human(label)}</legend>
        {Object.entries(values).map(([name, item]) => (
          <div className="command-property" key={name}>
            <CommandFields
              schema={definitions[name] ?? { type: typeof item === 'object' ? 'object' : 'string' }}
              value={item}
              previous={previous?.[name]}
              onChange={(next) => onChange({ ...values, [name]: next })}
              label={name}
              level={level + 1}
              hidden={secret}
            />
            <button
              type="button"
              className="remove-field"
              aria-label={'Omit ' + human(name)}
              onClick={() => {
                const rest = { ...values };
                delete rest[name];
                onChange(rest);
              }}
            >
              Omit
            </button>
          </div>
        ))}
        <div className="add-command-field">
          {available.length > 0 && (
            <select
              aria-label={'Add field to ' + label}
              value=""
              onChange={(event) => add(event.target.value)}
            >
              <option value="">Add a field…</option>
              {available.map((name) => (
                <option key={name} value={name}>
                  {human(name)}
                </option>
              ))}
            </select>
          )}
          {free && (
            <>
              <input
                aria-label={'Custom field in ' + label}
                value={key}
                onChange={(event) => setKey(event.target.value)}
                maxLength={128}
                placeholder="Property name"
              />
              <button
                type="button"
                disabled={
                  !key.trim() ||
                  Object.hasOwn(values, key.trim()) ||
                  ['__proto__', 'constructor', 'prototype'].includes(key.trim())
                }
                onClick={() => add(key.trim())}
              >
                Add property
              </button>
            </>
          )}
        </div>
      </fieldset>
    );
  }
  return (
    <label className="field" htmlFor={id}>
      {human(label)}
      {schema.enum ? (
        <select
          id={id}
          value={String(value ?? '')}
          onChange={(event) => onChange(schema.enum!.find((v) => String(v) === event.target.value))}
        >
          <option value="">Select…</option>
          {schema.enum.map((choice, index) => (
            <option key={index} value={String(choice)}>
              {String(choice)}
            </option>
          ))}
        </select>
      ) : schema.type === 'boolean' ? (
        <select
          id={id}
          value={String(value === true)}
          onChange={(event) => onChange(event.target.value === 'true')}
        >
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      ) : (
        <input
          id={id}
          autoComplete={secret ? 'new-password' : 'off'}
          type={
            secret
              ? 'password'
              : ['number', 'integer'].includes(schema.type ?? '')
                ? 'number'
                : 'text'
          }
          step={schema.type === 'integer' ? '1' : 'any'}
          value={value ?? ''}
          onChange={(event) =>
            onChange(
              ['integer', 'number'].includes(schema.type ?? '')
                ? event.target.value === ''
                  ? undefined
                  : Number(event.target.value)
                : event.target.value,
            )
          }
        />
      )}
      <small>{plainDescription(schema.description).slice(0, 240)}</small>
    </label>
  );
}
