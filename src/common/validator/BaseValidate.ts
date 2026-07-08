import { registerDecorator, ValidationArguments } from 'class-validator';

/** Validates enum values with filter operator support (eq, ne, in, lt, lte, gt, gte, range) */
export function baseValidateEnum<T extends Record<string, string | number>>(enumType: T): (value: string) => boolean {
  const enumValues = Object.values(enumType) as string[];

  return (value: string) => {
    const regex = /^(lt|lte|gt|gte|ne|in|range|eq):(.*)$/;
    const match = value.match(regex);

    if (match && match[2] !== undefined) {
      const operator = match[1];
      const operatorValue = match[2];

      if ((operator === 'eq' || operator === 'ne') && operatorValue === 'null') return true;

      if (operator === 'in') {
        const values = operatorValue.split(',');
        return values.every((v) => enumValues.includes(v.trim()));
      }

      if (operator === 'range') {
        const values = operatorValue.split(',');
        if (values.length !== 2) return false;
        return values.every((v) => enumValues.includes(v.trim()));
      }

      return enumValues.includes(operatorValue);
    }

    return enumValues.includes(value);
  };
}

/** Validates string values with filter operator support */
export function baseValidateString(): (value: string) => boolean {
  return (value: string) => {
    const regex = /^(lt|lte|gt|gte|ne|in|range|eq):(.*)$/;
    const match = value.match(regex);

    if (match && match[2] !== undefined) {
      const operator = match[1];
      const operatorValue = match[2];

      if ((operator === 'eq' || operator === 'ne') && operatorValue === 'null') return true;
      if (operator === 'in') return operatorValue.split(',').every((v) => v.trim().length > 0);
      if (operator === 'range') {
        const values = operatorValue.split(',');
        return values.length === 2 && values.every((v) => v.trim().length > 0);
      }
      return operatorValue.length > 0;
    }

    return value.length > 0;
  };
}

/** Validates number values with filter operator support */
export function baseValidateNumber(): (value: string) => boolean {
  const isValidNumber = (val: string): boolean => {
    if (val === 'null') return true;
    const num = Number(val.trim());
    return !Number.isNaN(num) && Number.isFinite(num);
  };

  return (value: string) => {
    const regex = /^(lt|lte|gt|gte|ne|in|range|eq):(.*)$/;
    const match = value.match(regex);

    if (match && match[2] !== undefined) {
      const operator = match[1];
      const operatorValue = match[2];

      if ((operator === 'eq' || operator === 'ne') && operatorValue === 'null') return true;
      if (operator === 'in') return operatorValue.split(',').every((v) => isValidNumber(v));
      if (operator === 'range') {
        const values = operatorValue.split(',');
        return values.length === 2 && values.every((v) => isValidNumber(v));
      }
      return isValidNumber(operatorValue);
    }

    return isValidNumber(value);
  };
}

/** Validates date values with filter operator support */
export function baseValidateDate(): (value: string) => boolean {
  const isValidDate = (val: string): boolean => {
    if (val === 'null') return true;
    return !Number.isNaN(new Date(val.trim()).getTime());
  };

  return (value: string) => {
    const regex = /^(lt|lte|gt|gte|ne|in|range|eq):(.*)$/;
    const match = value.match(regex);

    if (match && match[2] !== undefined) {
      const operator = match[1];
      const operatorValue = match[2];

      if ((operator === 'eq' || operator === 'ne') && operatorValue === 'null') return true;
      if (operator === 'in') return operatorValue.split(',').every((v) => isValidDate(v));
      if (operator === 'range') {
        const values = operatorValue.split(',');
        return values.length === 2 && values.every((v) => isValidDate(v));
      }
      return isValidDate(operatorValue);
    }

    return isValidDate(value);
  };
}

/** Validates boolean values with filter operator support */
export function baseValidateBoolean(): (value: string) => boolean {
  const validValues = ['true', 'false', '1', '0', 'null'];

  return (value: string) => {
    const regex = /^(eq|ne):(.*)$/;
    const match = value.match(regex);

    if (match && match[2] !== undefined) {
      return validValues.includes(match[2].toLowerCase());
    }

    return validValues.includes(value.toLowerCase());
  };
}

type PipeFunction = (value: any) => any;
type ValidatorFunction = (value: any, entity?: any) => boolean;

interface BaseValidateOptions {
  entity?: any;
  pipe?: PipeFunction;
}

function handleValidate(value: any, callbackFunction: ValidatorFunction, entity: any, pipe?: PipeFunction) {
  let val = value;

  if (pipe) {
    val = pipe(val);
    if (val === null) return false;
  }

  if (entity) return callbackFunction(val, entity);
  return callbackFunction(val);
}

export function BaseValidate(callbackFunction: ValidatorFunction, options: BaseValidateOptions = {}) {
  return (object: any, propertyName: string) => {
    registerDecorator({
      name: 'BaseValidate',
      target: object.constructor,
      propertyName: propertyName,
      async: true,
      constraints: [],
      validator: {
        validate(value: any, args: ValidationArguments) {
          const { entity } = options;
          let { pipe } = options;

          const validatorName = /function ([^(]*)/.exec(`${callbackFunction}`)?.[1];

          if (validatorName === 'isNumber' && !pipe) {
            pipe = (val: any) => parseInt(String(val), 10);
          }

          const regex = /^(lt|lte|gt|gte|ne|in|range|eq):(.*)$/;
          const match = `${value}`.match(regex);

          if (match?.[2]) {
            if (['lt', 'lte', 'gt', 'gte'].includes(match[1])) {
              return handleValidate(match[2], callbackFunction, entity, pipe);
            } else if (match[1] === 'ne') {
              if (match[2] === 'null') return true;
              return handleValidate(match[2], callbackFunction, entity, pipe);
            } else if (match[1] === 'in') {
              const arr = match[2].split(',');
              for (const item of arr) {
                if (!handleValidate(item, callbackFunction, entity, pipe)) return false;
              }
              return true;
            } else if (match[1] === 'range') {
              if (match[2].split(',')?.length === 2) {
                return (
                  handleValidate(match[2].split(',')[0], callbackFunction, entity, pipe) &&
                  handleValidate(match[2].split(',')[1], callbackFunction, entity, pipe)
                );
              }
              return false;
            } else if (match[1] === 'eq') {
              if (match[2] === 'null') return true;
            }
          }

          return handleValidate(value, callbackFunction, entity, pipe);
        },

        defaultMessage(args: ValidationArguments) {
          return `Invalid property '${args.property}'`;
        },
      },
    });
  };
}
