/* tslint:disable:only-arrow-functions */
import {expect} from 'chai'
import {mergeDeepSafe} from "../src";

describe('merge objects', function () {

    it('merges objects with conflicting properties', function () {
        const obj1 = {name: "george", one:"one", last_name:"simpson"};
        const obj2 = {name: "castanza", two:"two", last_name:"arnold"};
        const obj3 = {name: "Szekely"};


        const result = mergeDeepSafe(obj1, obj2, obj3);

        console.log(result);
        expect(result).eql({
            __name: 'Szekely',
            _last_name: 'arnold',
            _name: 'castanza',
            last_name: 'simpson',
            name: 'george',
            one: 'one',
            two: 'two',
        });
    })
});