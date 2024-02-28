/* tslint:disable:only-arrow-functions */
import {expect} from 'chai'
import {safeObjectAssign} from "../src";

describe('merge objects', function () {

    it('merges objects with conflicting properties', function () {
        const obj1 = {name: "george", one:"one", last_name:"simpson"};
        const obj2 = {name: "castanza", two:"two", last_name:"arnold"};
        const obj3 = {name: "Szekely"};


        const result = safeObjectAssign(obj1,[],obj2, obj3);

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
    });

    it('merges string values of objects with conflicting properties where specified', function () {
        const obj1 = {name: "george", one:"one", last_name:"simpson"};
        const obj2 = {name: "castanza", two:"two", last_name:"arnold"};
        const obj3 = {name: "Szekely"};


        const result = safeObjectAssign(obj1,["last_name"],obj2, obj3);

        console.log(result);
        expect(result).eql({
            __name: 'Szekely',
            _name: 'castanza',
            last_name: 'simpson - arnold',
            name: 'george',
            one: 'one',
            two: 'two'
        });
    });

    it('merges self referencing objects', function () {

        const selfRefObj:any = {name1:"name1", inner: {}, other: {}};
        selfRefObj.self = selfRefObj;
        selfRefObj.inner.bob = selfRefObj;
        selfRefObj.other.self = "this should not be lost";

        const obj2: any = {bob:"bob", name1:"name2"};

        const result = safeObjectAssign(obj2, [], selfRefObj);

        expect(result).eql({
            "_name1": "name1",
            "bob": "bob",
            "inner": {
                "bob": "[Circular ~.0]"
            },
            "name1": "name2",
            "other": {
                "self": "this should not be lost"
            },
            "self": "[Circular ~.0]"
        });
    })
});